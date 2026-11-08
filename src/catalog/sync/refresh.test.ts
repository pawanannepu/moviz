import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { isListable } from "@/catalog/listable";
import { createTmdbClient } from "@/catalog/tmdb/client";
import { movieEmbeddings, movieExternalIds, movies } from "@/db/schema";
import {
  details,
  fakeTmdb,
  personIdsOf,
  removeCatalogRows,
} from "@/test-support/catalog-fixtures";
import {
  TEST_DATABASE_URL,
  token,
  unitVector,
  useTestDb,
  vectorLiteral,
} from "@/test-support/test-db";
import { mapDetails } from "./map-details";
import { markMovieRemoved } from "./mark-removed";
import { persistMovie } from "./persist-movie";
import { pickMoviesToRefresh, REFRESH_LIMIT, refreshMovies } from "./refresh";
import { emptyRunSummary } from "./run-summary";

describe.skipIf(!TEST_DATABASE_URL)("refresh (AC-10, AC-11, AC-12)", () => {
  const ctx = useTestDb();
  const tmdbIds: number[] = [];
  const personIds: number[] = [];
  const today = new Date().toISOString().slice(0, 10);

  async function store(
    overrides: Parameters<typeof details>[1] = {},
    fetchedAt: string | null = "1970-01-02T00:00:00Z",
  ) {
    const movie = details(token(), overrides);
    tmdbIds.push(movie.id);
    personIds.push(...personIdsOf(movie));
    const stored = await persistMovie(ctx.db, mapDetails(movie));
    if (!stored.ok) throw new Error("fixture movie was not stored");
    await ctx.db
      .update(movies)
      .set({ fetchedAt: fetchedAt === null ? null : new Date(fetchedAt) })
      .where(eq(movies.id, stored.value.movieId));
    return { id: stored.value.movieId, movie };
  }

  const row = async (id: number) =>
    (await ctx.db.select().from(movies).where(eq(movies.id, id)))[0];

  function deps(
    options: Parameters<typeof fakeTmdb>[0],
    extra: { deadline?: number; now?: () => number } = {},
  ) {
    const fake = fakeTmdb(options);
    const tmdb = createTmdbClient({
      token: "test-token",
      fetch: fake.fetch,
      sleep: async () => undefined,
      random: () => 0,
    });
    return { fake, deps: { db: ctx.db, tmdb, today, ...extra } };
  }

  // Each test must be the only owner of the oldest rows, because a refresh picks
  // the oldest movies in the whole database. So every test cleans up after itself.
  afterEach(async () => {
    await removeCatalogRows(ctx.db, tmdbIds.splice(0), personIds.splice(0));
  });

  afterAll(async () => {
    await removeCatalogRows(ctx.db, tmdbIds, personIds);
  });

  describe("pickMoviesToRefresh (AC-11)", () => {
    it("lists the oldest first, with never fetched movies before all others", async () => {
      const newer = await store({}, "1970-03-01T00:00:00Z");
      const older = await store({}, "1970-01-15T00:00:00Z");
      const never = await store({}, null);

      const picked = await pickMoviesToRefresh(ctx.db, 1000);

      expect(picked.ok).toBe(true);
      if (!picked.ok) return;
      const at = (movie: ReturnType<typeof details>) =>
        picked.value.indexOf(movie.id);
      expect(at(never.movie)).toBeGreaterThanOrEqual(0);
      expect(at(never.movie)).toBeLessThan(at(older.movie));
      expect(at(older.movie)).toBeLessThan(at(newer.movie));
    });

    it("never picks a movie TMDB no longer returns", async () => {
      const gone = await store();
      await markMovieRemoved(ctx.db, gone.movie.id);

      const picked = await pickMoviesToRefresh(ctx.db, 1000);

      expect(picked.ok && picked.value.includes(gone.movie.id)).toBe(false);
    });

    it("picks a movie with no poster, because it may get one back", async () => {
      const unlisted = await store({ poster_path: null });

      const picked = await pickMoviesToRefresh(ctx.db, 1000);

      expect(picked.ok && picked.value.includes(unlisted.movie.id)).toBe(true);
    });

    it("returns at most the limit it is given", async () => {
      await store();
      await store();

      const picked = await pickMoviesToRefresh(ctx.db, 2);

      expect(picked.ok && picked.value).toHaveLength(2);
    });

    it("refreshes up to 100 movies per run", () => {
      expect(REFRESH_LIMIT).toBe(100);
    });
  });

  describe("refreshMovies", () => {
    it("rewrites the oldest movies first and moves their fetched_at to now (AC-11)", async () => {
      const first = await store({}, "1970-01-03T00:00:00Z");
      const second = await store({}, "1970-01-04T00:00:00Z");
      const third = await store({}, "1970-01-05T00:00:00Z");
      const changed = (m: ReturnType<typeof details>) => ({
        ...m,
        overview: `Refreshed ${m.id}`,
      });
      const { deps: d } = deps({
        movies: new Map(
          [first, second, third].map((s) => [s.movie.id, changed(s.movie)]),
        ),
      });

      const result = await refreshMovies(d, emptyRunSummary(), 2);

      expect(result.ok && result.value.updated).toBe(2);
      expect((await row(first.id)).overview).toBe(
        `Refreshed ${first.movie.id}`,
      );
      expect((await row(second.id)).overview).toBe(
        `Refreshed ${second.movie.id}`,
      );
      expect((await row(first.id)).fetchedAt?.getFullYear()).toBeGreaterThan(
        2000,
      );
      // The third was not picked, so it keeps its old text and date.
      expect((await row(third.id)).overview).toBe(third.movie.overview);
      expect((await row(third.id)).fetchedAt?.getFullYear()).toBe(1970);
    });

    it("marks a movie removed when TMDB says 404 (AC-12)", async () => {
      const gone = await store({}, "1970-01-06T00:00:00Z");
      const { deps: d } = deps({ movies: new Map() });

      const result = await refreshMovies(d, emptyRunSummary(), 1);

      expect(result.ok && result.value.removed).toBe(1);
      const saved = await row(gone.id);
      expect(saved.sourceMissingAt).not.toBeNull();
      expect(saved.overview).toBeNull();
      expect(saved.title).toBe(gone.movie.title);
    });

    it("marks a movie removed when TMDB now flags it adult (AC-12)", async () => {
      const flagged = await store({}, "1970-01-07T00:00:00Z");
      const { deps: d } = deps({
        movies: new Map([
          [flagged.movie.id, { ...flagged.movie, adult: true }],
        ]),
      });

      const result = await refreshMovies(d, emptyRunSummary(), 1);

      expect(result.ok && result.value.removed).toBe(1);
      expect((await row(flagged.id)).sourceMissingAt).not.toBeNull();
    });

    it("keeps refreshing a movie whose rules would fail today, because the floors do not apply to a stored movie", async () => {
      const weak = await store({}, "1970-01-08T00:00:00Z");
      const { deps: d } = deps({
        movies: new Map([[weak.movie.id, { ...weak.movie, vote_count: 3 }]]),
      });

      const result = await refreshMovies(d, emptyRunSummary(), 1);

      expect(result.ok && result.value.updated).toBe(1);
      expect((await row(weak.id)).voteCount).toBe(3);
      expect((await row(weak.id)).sourceMissingAt).toBeNull();
    });

    it("deletes the embeddings of a movie that lost its poster, keeps it in the rotation and hides it (AC-7, AC-19)", async () => {
      const lost = await store({}, "1970-01-09T00:00:00Z");
      await ctx.pool.query(
        `insert into movie_embeddings (movie_id, model, dimensions, embedding, text_hash)
         values ($1, 'voyage-4', 1024, $2::vector, 'hash')`,
        [lost.id, vectorLiteral(unitVector(0))],
      );
      const { deps: d } = deps({
        movies: new Map([
          [lost.movie.id, { ...lost.movie, poster_path: null }],
        ]),
      });

      await refreshMovies(d, emptyRunSummary(), 1);

      expect(
        await ctx.db
          .select()
          .from(movieEmbeddings)
          .where(eq(movieEmbeddings.movieId, lost.id)),
      ).toEqual([]);
      const listed = await ctx.db
        .select({ id: movies.id })
        .from(movies)
        .where(and(eq(movies.id, lost.id), isListable()));
      expect(listed).toEqual([]);
      const picked = await pickMoviesToRefresh(ctx.db, 1000);
      expect(picked.ok && picked.value.includes(lost.movie.id)).toBe(true);
    });

    it("stops the whole run with tmdb_unauthorized on a bad token (AC-15)", async () => {
      const victim = await store({}, "1970-01-10T00:00:00Z");
      const { deps: d } = deps({ movies: new Map(), allStatus: 401 });

      const result = await refreshMovies(d, emptyRunSummary(), 1);

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("tmdb_unauthorized");
      expect(!result.ok && result.error.summary.failed).toBe(0);
      expect((await row(victim.id)).sourceMissingAt).toBeNull();
    });

    it("counts a movie TMDB keeps failing on, leaves it untouched, and carries on (AC-15)", async () => {
      const bad = await store({}, "1970-01-11T00:00:00Z");
      const good = await store({}, "1970-01-12T00:00:00Z");
      const { deps: d } = deps({
        movies: new Map([
          [good.movie.id, { ...good.movie, overview: "Good refresh." }],
        ]),
        statusFor: new Map([[bad.movie.id, 500]]),
      });

      const result = await refreshMovies(d, emptyRunSummary(), 2);

      expect(result.ok && result.value).toMatchObject({
        updated: 1,
        failed: 1,
      });
      expect((await row(bad.id)).overview).toBe(bad.movie.overview);
      expect((await row(good.id)).overview).toBe("Good refresh.");
    });

    it("starts no work once the deadline has passed (AC-10)", async () => {
      await store({}, "1970-01-13T00:00:00Z");
      const { fake, deps: d } = deps(
        { movies: new Map() },
        { deadline: 1000, now: () => 2000 },
      );

      const result = await refreshMovies(d, emptyRunSummary(), 5);

      expect(result).toEqual({ ok: true, value: emptyRunSummary() });
      expect(fake.calls).toEqual([]);
    });

    it("puts no token into the summary (AC-16)", async () => {
      await store({}, "1970-01-14T00:00:00Z");
      const { deps: d } = deps({ movies: new Map(), allStatus: 401 });

      const result = await refreshMovies(d, emptyRunSummary(), 1);

      expect(JSON.stringify(result)).not.toContain("test-token");
    });

    it("leaves other movies' external ids alone", async () => {
      const kept = await store({}, "1970-01-16T00:00:00Z");
      const { deps: d } = deps({ movies: new Map() });

      await refreshMovies(d, emptyRunSummary(), 1);

      const ext = await ctx.db
        .select()
        .from(movieExternalIds)
        .where(inArray(movieExternalIds.externalId, [String(kept.movie.id)]));
      expect(ext).toHaveLength(1);
    });
  });
});

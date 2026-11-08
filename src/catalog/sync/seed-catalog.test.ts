import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createTmdbClient } from "@/catalog/tmdb/client";
import { movieExternalIds, movies, people } from "@/db/schema";
import {
  daysAgo,
  details,
  type FakeTmdbOptions,
  fakeTmdb,
  newPersonId,
  personIdsOf,
  removeCatalogRows,
} from "@/test-support/catalog-fixtures";
import { TEST_DATABASE_URL, token, useTestDb } from "@/test-support/test-db";
import { markMovieRemoved } from "./mark-removed";
import { forceSyncMovie, seedCatalog } from "./seed-catalog";

const HUGE_TARGET = 1_000_000;

describe.skipIf(!TEST_DATABASE_URL)("seedCatalog and forceSyncMovie", () => {
  const ctx = useTestDb();
  const tmdbIds: number[] = [];
  const personIds: number[] = [];
  const today = new Date().toISOString().slice(0, 10);

  function world(
    entries: ReturnType<typeof details>[],
    extra: Partial<FakeTmdbOptions> = {},
  ) {
    for (const movie of entries) {
      tmdbIds.push(movie.id);
      personIds.push(...personIdsOf(movie));
    }
    const fake = fakeTmdb({
      movies: new Map(entries.map((m) => [m.id, m])),
      votePages: [entries.map((m) => m.id)],
      ...extra,
    });
    const tmdb = createTmdbClient({
      token: "test-token",
      fetch: fake.fetch,
      sleep: async () => undefined,
      random: () => 0,
    });
    return { fake, deps: { db: ctx.db, tmdb, today } };
  }

  const detailCalls = (calls: string[], id: number) =>
    calls.filter((path) => path === `/movie/${id}`).length;

  const storedRow = async (tmdbId: number) => {
    const rows = await ctx.db
      .select({ movie: movies })
      .from(movieExternalIds)
      .innerJoin(movies, eq(movies.id, movieExternalIds.movieId))
      .where(eq(movieExternalIds.externalId, String(tmdbId)));
    return rows[0]?.movie;
  };

  afterAll(async () => {
    await removeCatalogRows(ctx.db, tmdbIds, personIds);
  });

  describe("seedCatalog", () => {
    it("stores the eligible movies and counts each skip under its reason (AC-1)", async () => {
      const tag = token();
      const good = details(`${tag} good`);
      const lowVotes = details(`${tag} low`, { vote_count: 499 });
      const noPoster = details(`${tag} poster`, { poster_path: null });
      const future = details(`${tag} future`, { release_date: daysAgo(-30) });
      const adult = details(`${tag} adult`, { adult: true });
      const { deps } = world([good, lowVotes, noPoster, future, adult]);

      const result = await seedCatalog(deps, { target: HUGE_TARGET });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toMatchObject({
        stored: 1,
        updated: 0,
        failed: 0,
        skipped: {
          low_votes: 1,
          no_poster: 1,
          future_date: 1,
          adult: 1,
        },
      });
      expect(await storedRow(good.id)).toBeDefined();
      for (const skipped of [lowVotes, noPoster, future, adult]) {
        expect(await storedRow(skipped.id)).toBeUndefined();
      }
    });

    it("walks discover in order and stores the movies it finds (AC-1)", async () => {
      const tag = token();
      const entries = [1, 2, 3].map((n) => details(`${tag} ${n}`));
      const { deps } = world(entries);

      const result = await seedCatalog(deps, { target: HUGE_TARGET });

      expect(result.ok && result.value.stored).toBe(3);
      for (const movie of entries) {
        expect(await storedRow(movie.id)).toBeDefined();
      }
    });

    it("reports a shortfall and still succeeds when discover runs out (AC-1)", async () => {
      const { deps } = world([details(token())]);

      const result = await seedCatalog(deps, { target: HUGE_TARGET });

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.shortfall).toBeGreaterThan(0);
    });

    it("makes no detail call for movies already stored, and creates no duplicates (AC-2)", async () => {
      const tag = token();
      const entries = [1, 2].map((n) => details(`${tag} ${n}`));
      const first = world(entries);
      await seedCatalog(first.deps, { target: HUGE_TARGET });
      const again = world(entries);

      const result = await seedCatalog(again.deps, { target: HUGE_TARGET });

      expect(result.ok && result.value).toMatchObject({
        stored: 0,
        updated: 0,
      });
      for (const movie of entries) {
        expect(detailCalls(again.fake.calls, movie.id)).toBe(0);
        const rows = await ctx.db
          .select()
          .from(movieExternalIds)
          .where(eq(movieExternalIds.externalId, String(movie.id)));
        expect(rows).toHaveLength(1);
      }
    });

    it("makes no discover or detail call when the target is already met (AC-1)", async () => {
      await ctx.fx.newMovie();
      const { fake, deps } = world([details(token())]);

      const result = await seedCatalog(deps, { target: 1 });

      expect(result.ok && result.value.shortfall).toBe(0);
      expect(fake.calls.some((p) => p.startsWith("/discover"))).toBe(false);
      expect(fake.calls.some((p) => p.startsWith("/movie/"))).toBe(false);
    });

    it("finishes the job when run again after a run that stopped halfway (AC-2)", async () => {
      const tag = token();
      const [a, b, c] = [1, 2, 3].map((n) => details(`${tag} ${n}`));
      const stopped = world([a, b, c], {
        statusFor: new Map([[b.id, 401]]),
      });

      const first = await seedCatalog(stopped.deps, {
        target: HUGE_TARGET,
        concurrency: 1,
      });

      expect(first.ok).toBe(false);
      expect(await storedRow(a.id)).toBeDefined();
      expect(await storedRow(c.id)).toBeUndefined();

      const resumed = world([a, b, c]);
      const second = await seedCatalog(resumed.deps, {
        target: HUGE_TARGET,
        concurrency: 1,
      });

      expect(second.ok && second.value.stored).toBe(2);
      expect(detailCalls(resumed.fake.calls, a.id)).toBe(0);
      for (const movie of [a, b, c]) {
        expect(await storedRow(movie.id)).toBeDefined();
      }
    });

    it("stops with tmdb_unauthorized on a bad token and does not count movies as failed (AC-15)", async () => {
      const { deps } = world([details(token())], { allStatus: 401 });

      const result = await seedCatalog(deps, { target: HUGE_TARGET });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("tmdb_unauthorized");
      expect(result.error.summary.failed).toBe(0);
    });

    it("stops with tmdb_unauthorized when a detail call is refused, keeping what was stored (AC-15)", async () => {
      const tag = token();
      const [a, b] = [1, 2].map((n) => details(`${tag} ${n}`));
      const { deps } = world([a, b], { statusFor: new Map([[b.id, 403]]) });

      const result = await seedCatalog(deps, {
        target: HUGE_TARGET,
        concurrency: 1,
      });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("tmdb_unauthorized");
      expect(await storedRow(a.id)).toBeDefined();
    });

    it("counts one movie that keeps failing and carries on with the others (AC-15)", async () => {
      const tag = token();
      const [a, b, c] = [1, 2, 3].map((n) => details(`${tag} ${n}`));
      const { deps } = world([a, b, c], {
        statusFor: new Map([[b.id, 500]]),
      });

      const result = await seedCatalog(deps, { target: HUGE_TARGET });

      expect(result.ok && result.value).toMatchObject({
        stored: 2,
        failed: 1,
      });
      expect(await storedRow(b.id)).toBeUndefined();
    });

    it("counts a movie TMDB answers with the wrong shape as skipped, not as a crash (AC-15)", async () => {
      const bad = details(token());
      const { deps } = world([bad], {
        rawFor: new Map([[bad.id, { id: "not a number" }]]),
      });

      const result = await seedCatalog(deps, { target: HUGE_TARGET });

      expect(result.ok && result.value.skipped.bad_shape).toBe(1);
      expect(await storedRow(bad.id)).toBeUndefined();
    });

    it("brings back a removed movie that discover returns again (AC-2)", async () => {
      const movie = details(token());
      const { deps } = world([movie]);
      await seedCatalog(deps, { target: HUGE_TARGET });
      await markMovieRemoved(ctx.db, movie.id);
      expect((await storedRow(movie.id))?.sourceMissingAt).not.toBeNull();

      const result = await seedCatalog(deps, { target: HUGE_TARGET });

      expect(result.ok && result.value.updated).toBe(1);
      const saved = await storedRow(movie.id);
      expect(saved?.sourceMissingAt).toBeNull();
      expect(saved?.overview).not.toBeNull();
    });

    it("deletes people with no credits at the end of the run (AC-19)", async () => {
      const orphanTmdbId = newPersonId();
      personIds.push(orphanTmdbId);
      await ctx.db
        .insert(people)
        .values({ tmdbId: orphanTmdbId, name: "Nobody In Any Movie" });
      const { deps } = world([details(token())]);

      await seedCatalog(deps, { target: HUGE_TARGET });

      const left = await ctx.db
        .select()
        .from(people)
        .where(eq(people.tmdbId, orphanTmdbId));
      expect(left).toEqual([]);
    });

    it("reports movies that share a title and year as a duplicate group", async () => {
      const tag = token();
      const a = details(tag, {
        title: `Same ${tag}`,
        original_title: `Same ${tag}`,
      });
      const b = details(tag, {
        title: `Same ${tag}`,
        original_title: `Same ${tag}`,
      });
      const { deps } = world([a, b]);

      const result = await seedCatalog(deps, { target: HUGE_TARGET });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(
        result.value.duplicateTitleGroups.some(
          (group) => group.includes(a.id) && group.includes(b.id),
        ),
      ).toBe(true);
    });

    it("never puts the token in the summary or error (AC-16)", async () => {
      const { deps } = world([details(token())], { allStatus: 401 });

      const result = await seedCatalog(deps, { target: HUGE_TARGET });

      expect(JSON.stringify(result)).not.toContain("test-token");
    });
  });

  describe("forceSyncMovie (AC-2)", () => {
    it("rewrites a stored movie and clears the removed flag", async () => {
      const movie = details(token());
      const { deps } = world([movie]);
      await seedCatalog(deps, { target: HUGE_TARGET });
      await markMovieRemoved(ctx.db, movie.id);

      const result = await forceSyncMovie(deps, movie.id);

      expect(result.ok && result.value.outcome).toEqual({ kind: "updated" });
      expect((await storedRow(movie.id))?.sourceMissingAt).toBeNull();
    });

    it("stores a movie it has not seen", async () => {
      const movie = details(token());
      const { deps } = world([movie]);

      const result = await forceSyncMovie(deps, movie.id);

      expect(result.ok && result.value.outcome).toEqual({ kind: "stored" });
      expect(await storedRow(movie.id)).toBeDefined();
    });

    it("marks a stored movie removed on a TMDB 404", async () => {
      const movie = details(token());
      const { deps } = world([movie]);
      await forceSyncMovie(deps, movie.id);
      const gone = world([]);

      const result = await forceSyncMovie(gone.deps, movie.id);

      expect(result.ok && result.value.outcome).toEqual({ kind: "removed" });
      expect(result.ok && result.value.summary.removed).toBe(1);
      expect((await storedRow(movie.id))?.sourceMissingAt).not.toBeNull();
    });

    it("reports not_found and writes nothing for an id that was never stored", async () => {
      const missing = details(token());
      const { deps } = world([]);

      const result = await forceSyncMovie(deps, missing.id);

      expect(result.ok && result.value.outcome).toEqual({ kind: "not_found" });
      expect(await storedRow(missing.id)).toBeUndefined();
    });

    it("reports why a movie fails the rules and leaves a stored row alone", async () => {
      const movie = details(token());
      const { deps } = world([movie]);
      await forceSyncMovie(deps, movie.id);
      const before = await storedRow(movie.id);
      const weak = world([{ ...movie, vote_count: 3, overview: "Changed." }]);

      const result = await forceSyncMovie(weak.deps, movie.id);

      expect(result.ok && result.value.outcome).toEqual({
        kind: "skipped",
        reason: "low_votes",
      });
      const after = await storedRow(movie.id);
      expect(after?.overview).toBe(before?.overview);
      expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
    });

    it("stops with tmdb_unauthorized on a bad token", async () => {
      const { deps } = world([], { allStatus: 401 });

      const result = await forceSyncMovie(deps, 123);

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("tmdb_unauthorized");
    });

    it("reports tmdb_failed and writes nothing when TMDB keeps failing", async () => {
      const movie = details(token());
      const { deps } = world([movie], {
        statusFor: new Map([[movie.id, 500]]),
      });

      const result = await forceSyncMovie(deps, movie.id);

      expect(!result.ok && result.error.code).toBe("tmdb_failed");
      expect(await storedRow(movie.id)).toBeUndefined();
    });
  });
});

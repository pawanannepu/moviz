import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { isListable } from "@/catalog/listable";
import {
  credits,
  movieEmbeddings,
  movieGenres,
  movies,
  movieTitles,
} from "@/db/schema";
import {
  details,
  newTmdbId,
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

describe.skipIf(!TEST_DATABASE_URL)("markMovieRemoved (AC-12)", () => {
  const ctx = useTestDb();
  const tmdbIds: number[] = [];
  const personIds: number[] = [];

  async function store() {
    const tag = token();
    const movie = details(tag, {
      original_title: `Original ${tag}`,
      alternative_titles: { titles: [{ title: `Alt ${tag}` }] },
    });
    tmdbIds.push(movie.id);
    personIds.push(...personIdsOf(movie));
    const stored = await persistMovie(ctx.db, mapDetails(movie));
    if (!stored.ok) throw new Error("fixture movie was not stored");
    await ctx.pool.query(
      `insert into movie_embeddings (movie_id, model, dimensions, embedding, text_hash)
       values ($1, 'voyage-4', 1024, $2::vector, 'hash')`,
      [stored.value.movieId, vectorLiteral(unitVector(0))],
    );
    return { id: stored.value.movieId, tmdbId: movie.id, tag };
  }

  afterAll(async () => {
    await removeCatalogRows(ctx.db, tmdbIds, personIds);
  });

  it("keeps the title, release date and id and removes the TMDB content", async () => {
    const { id, tmdbId, tag } = await store();

    const result = await markMovieRemoved(ctx.db, tmdbId);

    expect(result).toEqual({
      ok: true,
      value: { kind: "removed", movieId: id },
    });
    const [saved] = await ctx.db.select().from(movies).where(eq(movies.id, id));
    expect(saved).toMatchObject({
      id,
      title: `Movie ${tag}`,
      releaseDate: "2001-05-05",
      overview: null,
      tagline: null,
      posterPath: null,
      originalTitle: null,
      runtimeMinutes: null,
      originalLanguage: null,
      popularity: null,
      voteAverage: null,
      voteCount: null,
    });
    expect(saved.sourceMissingAt).not.toBeNull();
  });

  it("removes genres, credits, embeddings and every title except the primary one", async () => {
    const { id, tmdbId, tag } = await store();

    await markMovieRemoved(ctx.db, tmdbId);

    expect(
      await ctx.db
        .select()
        .from(movieGenres)
        .where(eq(movieGenres.movieId, id)),
    ).toEqual([]);
    expect(
      await ctx.db.select().from(credits).where(eq(credits.movieId, id)),
    ).toEqual([]);
    expect(
      await ctx.db
        .select()
        .from(movieEmbeddings)
        .where(eq(movieEmbeddings.movieId, id)),
    ).toEqual([]);
    const titles = await ctx.db
      .select()
      .from(movieTitles)
      .where(eq(movieTitles.movieId, id));
    expect(titles).toEqual([
      { movieId: id, titleNormalized: `movie ${tag}`, kind: "primary" },
    ]);
  });

  it("sets source_missing_at only the first time", async () => {
    const { id, tmdbId } = await store();
    await markMovieRemoved(ctx.db, tmdbId);
    const [first] = await ctx.db.select().from(movies).where(eq(movies.id, id));

    await markMovieRemoved(ctx.db, tmdbId);

    const [second] = await ctx.db
      .select()
      .from(movies)
      .where(eq(movies.id, id));
    expect(second.sourceMissingAt?.getTime()).toBe(
      first.sourceMissingAt?.getTime(),
    );
  });

  it("is unknown for a TMDB id nothing is stored for, and writes nothing", async () => {
    const result = await markMovieRemoved(ctx.db, newTmdbId());

    expect(result).toEqual({ ok: true, value: { kind: "unknown" } });
  });

  it("hides the movie from the listable rule (AC-7)", async () => {
    const { id, tmdbId } = await store();
    const listed = () =>
      ctx.db
        .select({ id: movies.id })
        .from(movies)
        .where(and(eq(movies.id, id), isListable()));
    expect(await listed()).toHaveLength(1);

    await markMovieRemoved(ctx.db, tmdbId);

    expect(await listed()).toEqual([]);
  });

  it("brings the movie back when it is written again (AC-2)", async () => {
    const { id, tmdbId } = await store();
    await markMovieRemoved(ctx.db, tmdbId);

    const again = details(token(), { id: tmdbId });
    personIds.push(...personIdsOf(again));
    await persistMovie(ctx.db, mapDetails(again));

    const [saved] = await ctx.db.select().from(movies).where(eq(movies.id, id));
    expect(saved.sourceMissingAt).toBeNull();
    expect(saved.overview).not.toBeNull();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("isListable (AC-7)", () => {
  const ctx = useTestDb();

  it("is true only for a live movie with a poster", async () => {
    const live = await ctx.fx.newMovie();
    const noPoster = await ctx.fx.newMovie();
    const gone = await ctx.fx.newMovie();
    await ctx.db
      .update(movies)
      .set({ posterPath: "/live.jpg" })
      .where(eq(movies.id, live.id));
    await ctx.db
      .update(movies)
      .set({ posterPath: "/gone.jpg", sourceMissingAt: new Date() })
      .where(eq(movies.id, gone.id));

    const rows = await ctx.db
      .select({ id: movies.id })
      .from(movies)
      .where(isListable());
    const ids = new Set(rows.map((r) => r.id));

    expect(ids.has(live.id)).toBe(true);
    expect(ids.has(noPoster.id)).toBe(false);
    expect(ids.has(gone.id)).toBe(false);
  });
});

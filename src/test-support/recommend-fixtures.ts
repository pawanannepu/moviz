import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach } from "vitest";
import {
  buildEmbeddingText,
  hashEmbeddingText,
} from "@/catalog/embedding/embedding-text";
import { EMBEDDING_MODEL } from "@/catalog/embedding/model";
import { createDb, type Db } from "@/db/create-db";
import {
  EMBEDDING_DIMENSIONS,
  feedFeedback,
  genres,
  movieEmbeddings,
  movies,
  ratings,
  swipeSkips,
  watchlistEntries,
} from "@/db/schema";
import { pgArray } from "@/recommend/pg-array";
import { token } from "./test-db";

/**
 * Shared support for the recommender tests (spec 0007). Only test files import
 * this. It builds many movies, vectors and ratings in a few queries, because the
 * test branch is over the network and one query per row is slow.
 *
 * The test branch is shared by every test file running at once, so a test must
 * not depend on the branch being empty and must not disturb other files:
 *
 * - Vectors: a movie that needs no particular similarity gets a random unit
 *   vector (about 0.03 from any other). A test that needs exact similarities
 *   uses dimensions from its file's own band (`DIM_BAND_SIZE` dimensions each,
 *   from `FIRST_BAND_DIM`), so two files never share a dimension.
 * - Cleanup: each test removes its own movies afterwards (`afterEach`), so one
 *   test's lookalikes never reach the next test's candidates.
 * - The catalog's embed sweep (run by other test files) rewrites any listable
 *   movie whose stored `text_hash` is not the hash of its real text, so
 *   embeddings here carry the real hash. A listable movie with no embedding at
 *   all can still be swept; tests that need "no embedding" and nothing else use
 *   a withdrawn movie (`removed: true`), which the sweep never touches.
 * - Never write rows that point at movies another file made (for example a skip
 *   on every movie): that blocks the other file from deleting its movies.
 */

/** The first dimension a band uses. Other test files use the dimensions below. */
const FIRST_BAND_DIM = 128;
/** Dimensions in one band. */
export const DIM_BAND_SIZE = 64;

/** A random unit vector. */
export function randomUnit(): number[] {
  const vector = Array.from(
    { length: EMBEDDING_DIMENSIONS },
    () => Math.random() - 0.5,
  );
  const norm = Math.hypot(...vector);
  return vector.map((x) => x / norm);
}

/** First dimension of a file's band. Give each test file its own band number. */
export const bandStart = (band: number) =>
  FIRST_BAND_DIM + band * DIM_BAND_SIZE;

/** A vector with the given (dimension, value) pairs and zeros elsewhere. */
export function vec(parts: [number, number][]): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const [dim, value] of parts) vector[dim] = value;
  return vector;
}

/** A vector whose cosine similarity to the unit vector at `anchorDim` is `similarity`. */
export function near(
  anchorDim: number,
  similarity: number,
  privateDim: number,
): number[] {
  return vec([
    [anchorDim, similarity],
    [privateDim, Math.sqrt(1 - similarity * similarity)],
  ]);
}

export type MovieSpec = {
  /** The embedding. Leave out for a fresh private unit vector, `null` for no embedding. */
  vector?: number[] | null;
  /** The model of the embedding. Defaults to the current `EMBEDDING_MODEL`. */
  model?: string;
  voteCount?: number | null;
  voteAverage?: number | null;
  releaseDate?: string | null;
  /** False leaves the poster out, which makes the movie not listable. */
  poster?: boolean;
  /** True marks the movie as withdrawn by the catalog (not listable). */
  removed?: boolean;
};

export type RatingEntry = {
  movieId: number;
  score: number;
  source?: "swipe" | "import" | "manual";
  updatedAt?: Date;
};

/**
 * Movies, ratings and skips for one test file, removed again afterwards. Call
 * inside `describe`, next to `useTestDb()`, passing its `db` lazily.
 */
export function useRecommendFixtures(
  getDb: () => Db,
  options: { band?: number; privateFrom?: number } = {},
) {
  const movieIds: number[] = [];
  const genreIds: number[] = [];
  const band = options.band ?? 0;
  const firstPrivate = options.privateFrom ?? bandStart(band);
  const lastDim = bandStart(band) + DIM_BAND_SIZE - 1;
  let nextDim = firstPrivate;

  /** A dimension in this file's band that nothing else in the test uses yet. */
  function privateDim(): number {
    if (nextDim > lastDim) {
      throw new Error(
        "The test used up its dimensions; share one private dimension",
      );
    }
    return nextDim++;
  }

  /** Inserts movies (and their embeddings) in a few queries. Ids come back in spec order. */
  async function addMovies(specs: MovieSpec[]): Promise<number[]> {
    const run = token();
    const titles = specs.map((_, i) => `Rec Test ${run} ${i}`);
    // One transaction, so no other test file ever sees a movie without its
    // vector: the catalog's embed sweep would embed such a movie itself, with
    // its own vector, and then fail or overwrite ours.
    const ids = await getDb().transaction(async (tx) => {
      const rows = await tx
        .insert(movies)
        .values(
          specs.map((spec, i) => ({
            title: titles[i],
            titleNormalized: titles[i].toLowerCase(),
            posterPath: spec.poster === false ? null : `/rec-${run}-${i}.jpg`,
            voteCount: spec.voteCount ?? null,
            voteAverage: spec.voteAverage ?? null,
            releaseDate: spec.releaseDate ?? null,
            sourceMissingAt: spec.removed ? new Date() : null,
          })),
        )
        .returning({
          id: movies.id,
          title: movies.title,
          releaseYear: movies.releaseYear,
        });
      const idByTitle = new Map(rows.map((row) => [row.title, row.id]));
      const yearByTitle = new Map(
        rows.map((row) => [row.title, row.releaseYear]),
      );
      const inserted = titles.map((title) => {
        const id = idByTitle.get(title);
        if (id === undefined) throw new Error("A movie was not inserted");
        return id;
      });

      const embeddings = specs.flatMap((spec, i) => {
        if (spec.vector === null) return [];
        return [
          {
            movieId: inserted[i],
            model: spec.model ?? EMBEDDING_MODEL,
            dimensions: EMBEDDING_DIMENSIONS,
            embedding: spec.vector ?? randomUnit(),
            // The real hash of the movie's embedding text, so a sweep that does
            // see the row treats it as current and leaves it alone.
            textHash: hashEmbeddingText(
              buildEmbeddingText({
                title: titles[i],
                releaseYear: yearByTitle.get(titles[i]) ?? null,
                genres: [],
                tagline: null,
                overview: null,
                directors: [],
                cast: [],
              }),
            ),
          },
        ];
      });
      for (let from = 0; from < embeddings.length; from += 150) {
        await tx
          .insert(movieEmbeddings)
          .values(embeddings.slice(from, from + 150));
      }
      return inserted;
    });
    movieIds.push(...ids);
    return ids;
  }

  /**
   * Of these movies, the ones that now have an embedding for the current model.
   * For a movie a test made with none: another test file's embed sweep may have
   * added one since, and then the test must not expect the movie to be absent.
   */
  async function embeddedNow(ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const rows = await getDb()
      .select({ movieId: movieEmbeddings.movieId })
      .from(movieEmbeddings)
      .where(
        and(
          inArray(movieEmbeddings.movieId, ids),
          eq(movieEmbeddings.model, EMBEDDING_MODEL),
        ),
      );
    return rows.map((row) => row.movieId);
  }

  /** One movie, for tests that need only one. */
  async function addMovie(spec: MovieSpec = {}): Promise<number> {
    const [id] = await addMovies([spec]);
    return id;
  }

  /** Saves ratings in one query. */
  async function rate(userId: string, entries: RatingEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await getDb()
      .insert(ratings)
      .values(
        entries.map((entry) => ({
          userId,
          movieId: entry.movieId,
          score: entry.score,
          source: entry.source ?? "manual",
          ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
        })),
      );
  }

  /** Skips a movie for a user, so it is hidden from them. */
  async function skip(userId: string, movieId: number): Promise<void> {
    await getDb().insert(swipeSkips).values({ userId, movieId });
  }

  /** Adds genres (random names) and links them to a movie. Returns the names. */
  async function addGenres(movieId: number, count: number): Promise<string[]> {
    const db = getDb();
    const run = token();
    const names = Array.from({ length: count }, (_, i) => `Genre ${run} ${i}`);
    if (count === 0) return [];
    const rows = await db
      .insert(genres)
      .values(names.map((name) => ({ name })))
      .returning({ id: genres.id });
    genreIds.push(...rows.map((row) => row.id));
    await db.execute(sql`
      insert into movie_genres (movie_id, genre_id)
      select ${movieId}::bigint, g from unnest(${pgArray(rows.map((r) => r.id))}::smallint[]) as g
    `);
    return names;
  }

  /**
   * Removes the movies this test made, with the ratings, skips, watchlist rows
   * and feedback on them (each movie key restricts a delete of the movie).
   */
  async function cleanupMovies(): Promise<void> {
    const db = getDb();
    if (!db) return;
    if (movieIds.length > 0) {
      await db.delete(ratings).where(inArray(ratings.movieId, movieIds));
      await db.delete(swipeSkips).where(inArray(swipeSkips.movieId, movieIds));
      await db
        .delete(watchlistEntries)
        .where(inArray(watchlistEntries.movieId, movieIds));
      await db
        .delete(feedFeedback)
        .where(inArray(feedFeedback.movieId, movieIds));
      await db.delete(movies).where(inArray(movies.id, movieIds));
      movieIds.length = 0;
    }
    if (genreIds.length > 0) {
      await db.delete(genres).where(inArray(genres.id, genreIds));
      genreIds.length = 0;
    }
    nextDim = firstPrivate;
  }

  afterEach(cleanupMovies);
  // Safety net if a test file ends with movies still there.
  afterAll(cleanupMovies);

  return {
    addMovies,
    addMovie,
    embeddedNow,
    rate,
    skip,
    addGenres,
    privateDim,
  };
}

export type Captured = { client: number; text: string; values: unknown[] };

/**
 * A second connection pool to the test branch that records every statement
 * with its bound values and the connection that ran it. For the tests that
 * count queries or check what a call reads. The caller ends the pool.
 */
export function capturingDb(connectionString: string) {
  const { pool, db } = createDb(connectionString, { max: 2 });
  const log: Captured[] = [];
  let clients = 0;
  pool.on("connect", (client) => {
    const id = ++clients;
    const original = client.query.bind(client) as (...a: unknown[]) => unknown;
    (client as unknown as { query: unknown }).query = (...args: unknown[]) => {
      const [first, second] = args as [
        string | { text: string; values?: unknown[] },
        unknown[]?,
      ];
      const text = typeof first === "string" ? first : first.text;
      const values =
        (typeof first === "string" ? second : (first.values ?? second)) ?? [];
      log.push({ client: id, text, values });
      return original(...args);
    };
  });
  return { pool, db, log };
}

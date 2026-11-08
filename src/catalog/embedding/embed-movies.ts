import { eq, sql } from "drizzle-orm";
import { isListable } from "@/catalog/listable";
import type { Db } from "@/db/create-db";
import { type DbUnavailable, toDbFailure } from "@/db/failure";
import {
  credits,
  genres,
  movieEmbeddings,
  movieGenres,
  movies,
  people,
} from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import {
  buildEmbeddingText,
  type EmbeddingInput,
  hashEmbeddingText,
} from "./embedding-text";
import {
  EMBED_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "./model";
import type { VoyageClient, VoyageError } from "./voyage-client";

export type EmbedDeps = {
  db: Db;
  voyage: VoyageClient;
  /** Epoch milliseconds. No new batch starts after it. Omit for no limit. */
  deadline?: number;
  /** Replaceable for tests. */
  now?: () => number;
};

export type EmbedOptions = {
  /** Embed at most this many movies. Omit for all that need it. */
  limit?: number;
};

export type EmbedResult = {
  /** Vectors written. */
  embedded: number;
  /** Movies whose vector had the wrong size, or that were removed after selection. */
  failed: number;
};

/** What stopped the run. Batches saved before it stay saved. */
export type EmbedError = (VoyageError | DbUnavailable) & {
  progress: EmbedResult;
};

type MovieRow = {
  id: number;
  title: string;
  releaseYear: number | null;
  tagline: string | null;
  overview: string | null;
};

/** Everything `buildEmbeddingText` needs, for every listable movie. Four queries. */
async function loadListableInputs(
  db: Db,
): Promise<{ movieId: number; input: EmbeddingInput }[]> {
  const [movieRows, genreRows, creditRows] = await Promise.all([
    db
      .select({
        id: movies.id,
        title: movies.title,
        releaseYear: movies.releaseYear,
        tagline: movies.tagline,
        overview: movies.overview,
      })
      .from(movies)
      .where(isListable())
      .orderBy(movies.id) as Promise<MovieRow[]>,
    db
      .select({ movieId: movieGenres.movieId, name: genres.name })
      .from(movieGenres)
      .innerJoin(genres, eq(genres.id, movieGenres.genreId))
      .innerJoin(movies, eq(movies.id, movieGenres.movieId))
      .where(isListable()),
    db
      .select({
        movieId: credits.movieId,
        role: credits.role,
        name: people.name,
      })
      .from(credits)
      .innerJoin(people, eq(people.id, credits.personId))
      .innerJoin(movies, eq(movies.id, credits.movieId))
      .where(isListable())
      .orderBy(credits.billingOrder, people.id),
  ]);

  const genresByMovie = new Map<number, string[]>();
  for (const row of genreRows) {
    const list = genresByMovie.get(row.movieId) ?? [];
    list.push(row.name);
    genresByMovie.set(row.movieId, list);
  }
  const directorsByMovie = new Map<number, string[]>();
  const castByMovie = new Map<number, string[]>();
  for (const row of creditRows) {
    const target = row.role === "director" ? directorsByMovie : castByMovie;
    const list = target.get(row.movieId) ?? [];
    list.push(row.name);
    target.set(row.movieId, list);
  }

  return movieRows.map((row) => ({
    movieId: row.id,
    input: {
      title: row.title,
      releaseYear: row.releaseYear,
      tagline: row.tagline,
      overview: row.overview,
      genres: genresByMovie.get(row.id) ?? [],
      directors: directorsByMovie.get(row.id) ?? [],
      cast: castByMovie.get(row.id) ?? [],
    },
  }));
}

type Pending = { movieId: number; text: string; textHash: string };

/**
 * Writes one batch in a single statement (spec 0003, AC-19). The insert selects
 * only movies that are still listable at write time, so a movie removed after it
 * was selected gets no vector. Returns how many vectors were written.
 */
async function writeBatch(
  db: Db,
  rows: { movieId: number; textHash: string; vector: number[] }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  // pgvector reads "[0.1,0.2,...]", which is exactly what JSON.stringify gives an array.
  const payload = JSON.stringify(
    rows.map((row) => ({
      movie_id: row.movieId,
      text_hash: row.textHash,
      embedding: JSON.stringify(row.vector),
    })),
  );
  const result = await db.execute(sql`
    insert into ${movieEmbeddings} (movie_id, model, dimensions, embedding, text_hash)
    select v.movie_id, ${EMBEDDING_MODEL}, ${EMBEDDING_DIMENSIONS}, v.embedding::vector, v.text_hash
    from jsonb_to_recordset(${payload}::jsonb)
      as v(movie_id bigint, text_hash text, embedding text)
    join ${movies} on ${movies.id} = v.movie_id
    where ${isListable()}
    on conflict (movie_id, model) do update set
      dimensions = excluded.dimensions,
      embedding = excluded.embedding,
      text_hash = excluded.text_hash,
      created_at = now()
  `);
  return result.rowCount ?? 0;
}

/**
 * Embeds the listable movies that have no current vector (spec 0003, AC-8,
 * AC-9). A movie needs work when it has no row for `EMBEDDING_MODEL`, or its
 * stored `text_hash` differs from the hash of today's text. So a second run with
 * no data change makes no Voyage call.
 *
 * Movies go to Voyage in batches of up to 100, and each batch is saved before the
 * next starts. If Voyage fails, earlier batches stay saved and the error carries
 * the progress. A vector of the wrong size fails that one movie only. Stops
 * starting batches after `deps.deadline`.
 */
export async function embedMovies(
  deps: EmbedDeps,
  options: EmbedOptions = {},
): Promise<Result<EmbedResult, EmbedError>> {
  const { db, voyage } = deps;
  const now = deps.now ?? Date.now;
  let progress: EmbedResult = { embedded: 0, failed: 0 };

  try {
    const [inputs, storedHashes] = await Promise.all([
      loadListableInputs(db),
      db
        .select({
          movieId: movieEmbeddings.movieId,
          textHash: movieEmbeddings.textHash,
        })
        .from(movieEmbeddings)
        .where(eq(movieEmbeddings.model, EMBEDDING_MODEL)),
    ]);
    const hashByMovie = new Map(
      storedHashes.map((row) => [row.movieId, row.textHash]),
    );

    const pending: Pending[] = [];
    for (const { movieId, input } of inputs) {
      const text = buildEmbeddingText(input);
      const textHash = hashEmbeddingText(text);
      if (hashByMovie.get(movieId) !== textHash) {
        pending.push({ movieId, text, textHash });
      }
    }
    const work =
      options.limit === undefined ? pending : pending.slice(0, options.limit);

    for (let start = 0; start < work.length; start += EMBED_BATCH_SIZE) {
      if (deps.deadline !== undefined && now() >= deps.deadline) break;
      const batch = work.slice(start, start + EMBED_BATCH_SIZE);

      const vectors = await voyage.embedDocuments(
        batch.map((item) => item.text),
        { deadline: deps.deadline },
      );
      if (!vectors.ok) return err({ ...vectors.error, progress });

      const good = batch.flatMap((item, index) => {
        const vector = vectors.value[index];
        return vector
          ? [{ movieId: item.movieId, textHash: item.textHash, vector }]
          : [];
      });
      const written = await writeBatch(db, good);
      progress = {
        embedded: progress.embedded + written,
        // Wrong size, or removed since it was selected.
        failed: progress.failed + (batch.length - written),
      };
    }
    return ok(progress);
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable")
      return err({ ...failure, progress });
    throw error;
  }
}

import { and, desc, eq, notExists, sql } from "drizzle-orm";
import { lockUserImportShared, lockUserMovie } from "@/db/advisory-lock";
import type { Db } from "@/db/create-db";
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  type InvalidCursor,
} from "@/db/cursor";
import {
  type DbUnavailable,
  toDbFailure,
  unexpectedDbError,
} from "@/db/failure";
import { movies, ratings, watchlistEntries } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

export type WatchlistMovie = {
  movieId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  addedAt: Date;
};

export type SeenMovie = {
  movieId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  score: number;
  updatedAt: Date;
};

export type MovieListPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type WatchlistError = InvalidCursor | DbUnavailable;
export type AddWatchlistError =
  | { code: "already_rated" }
  | { code: "movie_not_found" }
  | { code: "user_not_found" }
  | DbUnavailable;

/** Adds a movie for later, refusing a movie the user has already rated. */
export async function addToWatchlist(
  db: Db,
  input: { userId: string; movieId: number },
): Promise<Result<void, AddWatchlistError>> {
  try {
    const result = await db.transaction(async (tx) => {
      await lockUserImportShared(tx, input.userId);
      await lockUserMovie(tx, input.userId, input.movieId);
      const [rating] = await tx
        .select({ movieId: ratings.movieId })
        .from(ratings)
        .where(
          and(
            eq(ratings.userId, input.userId),
            eq(ratings.movieId, input.movieId),
          ),
        );
      if (rating) return err({ code: "already_rated" as const });
      await tx
        .insert(watchlistEntries)
        .values({ userId: input.userId, movieId: input.movieId })
        .onConflictDoNothing();
      return ok(undefined);
    });
    return result;
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure) return err(failure);
    throw unexpectedDbError("addToWatchlist", error);
  }
}

/** Removes a movie from the watchlist. Repeating the request is harmless. */
export async function removeFromWatchlist(
  db: Db,
  input: { userId: string; movieId: number },
): Promise<Result<void, DbUnavailable>> {
  try {
    await db.transaction(async (tx) => {
      await lockUserImportShared(tx, input.userId);
      await lockUserMovie(tx, input.userId, input.movieId);
      await tx
        .delete(watchlistEntries)
        .where(
          and(
            eq(watchlistEntries.userId, input.userId),
            eq(watchlistEntries.movieId, input.movieId),
          ),
        );
    });
    return ok(undefined);
  } catch (error) {
    if (toDbFailure(error)?.code === "db_unavailable") {
      return err({ code: "db_unavailable" });
    }
    throw unexpectedDbError("removeFromWatchlist", error);
  }
}

/** One page of saved movies, newest first, using the shared opaque cursor. */
export async function listWatchlist(
  db: Db,
  input: { userId: string; cursor?: string; limit?: number },
): Promise<Result<MovieListPage<WatchlistMovie>, WatchlistError>> {
  const limit = clampLimit(input.limit);
  let after = sql`true`;
  if (input.cursor !== undefined) {
    const decoded = decodeCursor(input.cursor);
    if (!decoded.ok) return err(decoded.error);
    const { timestamp, id } = decoded.value;
    after = sql`(${watchlistEntries.addedAt}, ${watchlistEntries.movieId}) < (${timestamp}::timestamptz, ${id}::bigint)`;
  }
  try {
    const rows = await db
      .select({
        movieId: watchlistEntries.movieId,
        title: movies.title,
        year: movies.releaseYear,
        posterPath: movies.posterPath,
        addedAt: watchlistEntries.addedAt,
        addedAtText: sql<string>`${watchlistEntries.addedAt}::text`,
      })
      .from(watchlistEntries)
      .innerJoin(movies, eq(movies.id, watchlistEntries.movieId))
      .where(
        and(
          eq(watchlistEntries.userId, input.userId),
          after,
          notExists(
            db
              .select({ movieId: ratings.movieId })
              .from(ratings)
              .where(
                and(
                  eq(ratings.userId, watchlistEntries.userId),
                  eq(ratings.movieId, watchlistEntries.movieId),
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(watchlistEntries.addedAt), desc(watchlistEntries.movieId))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return ok({
      items: page.map(({ addedAtText: _text, ...item }) => item),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ timestamp: last.addedAtText, id: last.movieId })
          : null,
    });
  } catch (error) {
    if (toDbFailure(error)?.code === "db_unavailable") {
      return err({ code: "db_unavailable" });
    }
    throw unexpectedDbError("listWatchlist", error);
  }
}

/** One page of rated movies, which are the user's seen list. */
export async function listSeenMovies(
  db: Db,
  input: { userId: string; cursor?: string; limit?: number },
): Promise<Result<MovieListPage<SeenMovie>, WatchlistError>> {
  const limit = clampLimit(input.limit);
  let after = sql`true`;
  if (input.cursor !== undefined) {
    const decoded = decodeCursor(input.cursor);
    if (!decoded.ok) return err(decoded.error);
    const { timestamp, id } = decoded.value;
    after = sql`(${ratings.updatedAt}, ${ratings.movieId}) < (${timestamp}::timestamptz, ${id}::bigint)`;
  }
  try {
    const rows = await db
      .select({
        movieId: ratings.movieId,
        title: movies.title,
        year: movies.releaseYear,
        posterPath: movies.posterPath,
        score: ratings.score,
        updatedAt: ratings.updatedAt,
        updatedAtText: sql<string>`${ratings.updatedAt}::text`,
      })
      .from(ratings)
      .innerJoin(movies, eq(movies.id, ratings.movieId))
      .where(and(eq(ratings.userId, input.userId), after))
      .orderBy(desc(ratings.updatedAt), desc(ratings.movieId))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return ok({
      items: page.map(({ updatedAtText: _text, ...item }) => item),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ timestamp: last.updatedAtText, id: last.movieId })
          : null,
    });
  } catch (error) {
    if (toDbFailure(error)?.code === "db_unavailable") {
      return err({ code: "db_unavailable" });
    }
    throw unexpectedDbError("listSeenMovies", error);
  }
}

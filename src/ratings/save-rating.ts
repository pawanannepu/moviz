import { and, eq, sql } from "drizzle-orm";
import { lockUserImportShared, lockUserMovie } from "@/db/advisory-lock";
import type { Db } from "@/db/create-db";
import {
  type DbFailure,
  type MovieNotFound,
  toDbFailure,
  type UserNotFound,
} from "@/db/failure";
import { ratings, swipeSkips } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

export type Rating = typeof ratings.$inferSelect;
export type RatingSource = Rating["source"];

export type SaveRatingError =
  | { code: "invalid_score" }
  | MovieNotFound
  | UserNotFound
  | Extract<DbFailure, { code: "db_unavailable" }>;

export type SaveRatingInput = {
  userId: string;
  movieId: number;
  /** 1 to 10 (half stars: a score of 7 is 3.5 stars). */
  score: number;
  source: RatingSource;
};

/**
 * Saves a rating: one per user and movie. Saving again overwrites the score and
 * source and updates `updated_at`; `rated_at` keeps the first time. In one
 * transaction, under the per user and movie advisory lock, it also removes the
 * movie from the user's skips (and, from feature 13, their watchlist), so a movie
 * is never both rated and skipped. The caller has already checked who the user is.
 */
export async function saveRating(
  db: Db,
  input: SaveRatingInput,
): Promise<Result<Rating, SaveRatingError>> {
  const { userId, movieId, score, source } = input;
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    return err({ code: "invalid_score" });
  }
  try {
    const saved = await db.transaction(async (tx) => {
      // Shared import lock first, then the movie lock (spec 0009, AC-17).
      await lockUserImportShared(tx, userId);
      await lockUserMovie(tx, userId, movieId);
      const [row] = await tx
        .insert(ratings)
        .values({ userId, movieId, score, source })
        .onConflictDoUpdate({
          target: [ratings.userId, ratings.movieId],
          // `rated_at` is left alone: it keeps the first time the movie was rated.
          set: { score, source, updatedAt: sql`now()` },
        })
        .returning();
      await tx
        .delete(swipeSkips)
        .where(
          and(eq(swipeSkips.userId, userId), eq(swipeSkips.movieId, movieId)),
        );
      return row;
    });
    return ok(saved);
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure) return err(failure);
    throw error;
  }
}

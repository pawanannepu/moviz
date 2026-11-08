import { sql } from "drizzle-orm";
import { lockUserMovie } from "@/db/advisory-lock";
import type { Db } from "@/db/create-db";
import {
  type DbUnavailable,
  type MovieNotFound,
  toDbFailure,
  type UserNotFound,
} from "@/db/failure";
import { err, ok, type Result } from "@/lib/result";
import { saveRating } from "./save-rating";
import { type SwipeChoice, swipeScore } from "./swipe-score";

export type SaveSwipeError = MovieNotFound | UserNotFound | DbUnavailable;

export type SaveSwipeInput = {
  userId: string;
  movieId: number;
  choice: SwipeChoice;
};

/**
 * Records one swipe. Liked and disliked save a rating of 8 or 2 with source
 * `swipe`. Not seen saves a skip and no rating, and does nothing when the movie
 * is already rated. Repeating the same swipe is harmless, so a double tap never
 * errors.
 */
export async function saveSwipe(
  db: Db,
  input: SaveSwipeInput,
): Promise<Result<void, SaveSwipeError>> {
  const { userId, movieId, choice } = input;

  if (choice !== "not_seen") {
    const saved = await saveRating(db, {
      userId,
      movieId,
      score: swipeScore(choice),
      source: "swipe",
    });
    if (saved.ok) return ok(undefined);
    // The score comes from a constant, so `invalid_score` cannot happen here.
    if (saved.error.code === "invalid_score") {
      throw new Error("swipeScore produced an invalid score");
    }
    return err(saved.error);
  }

  try {
    await db.transaction(async (tx) => {
      await lockUserMovie(tx, userId, movieId);
      await tx.execute(sql`
        insert into swipe_skips (user_id, movie_id)
        select ${userId}::text, ${movieId}::bigint
        where not exists (
          select 1 from ratings
          where user_id = ${userId}::text and movie_id = ${movieId}::bigint
        )
        on conflict do nothing
      `);
    });
    return ok(undefined);
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure) return err(failure);
    throw error;
  }
}

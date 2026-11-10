import { and, eq } from "drizzle-orm";
import { lockUserMovie } from "@/db/advisory-lock";
import type { Db } from "@/db/create-db";
import { type DbFailure, toDbFailure } from "@/db/failure";
import { ratings, swipeSkips } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import { type SwipeChoice, swipeScore } from "./swipe-score";

export type UndoSwipeInput = {
  userId: string;
  movieId: number;
  choice: SwipeChoice;
};

/**
 * Takes back one swipe (spec 0006, AC-5), under the same per user and movie
 * lock as `saveSwipe`. Not seen deletes only the skip. Liked or disliked
 * deletes only a rating whose source is `swipe` and whose score matches the
 * choice, so a rating that is now manual or imported is never touched.
 * `restored` is true only when a row was deleted. Succeeds when there is
 * nothing to delete.
 */
export async function undoSwipe(
  db: Db,
  input: UndoSwipeInput,
): Promise<Result<{ restored: boolean }, DbFailure>> {
  const { userId, movieId, choice } = input;
  try {
    const restored = await db.transaction(async (tx) => {
      await lockUserMovie(tx, userId, movieId);
      if (choice === "not_seen") {
        const removed = await tx
          .delete(swipeSkips)
          .where(
            and(eq(swipeSkips.userId, userId), eq(swipeSkips.movieId, movieId)),
          )
          .returning({ movieId: swipeSkips.movieId });
        return removed.length > 0;
      }
      const removed = await tx
        .delete(ratings)
        .where(
          and(
            eq(ratings.userId, userId),
            eq(ratings.movieId, movieId),
            eq(ratings.source, "swipe"),
            eq(ratings.score, swipeScore(choice)),
          ),
        )
        .returning({ movieId: ratings.movieId });
      return removed.length > 0;
    });
    return ok({ restored });
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure) return err(failure);
    throw error;
  }
}

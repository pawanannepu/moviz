"use server";

import { z } from "zod";
import { getUserForAction } from "@/auth/session";
import { db } from "@/db/client";
import { err, ok, type Result } from "@/lib/result";
import { saveSwipe } from "@/ratings/save-swipe";
import { undoSwipe } from "@/ratings/undo-swipe";
import { countProgress, type Progress } from "./count-progress";
import { finishOnboarding } from "./finish-onboarding";
import { isMovieListable } from "./is-movie-listable";

/*
 * Server Actions for the onboarding deck (spec 0006). Each one reads the user
 * from the live session, validates its input with Zod, returns a typed result
 * and touches only that user's rows. None of them logs or returns a movie, a
 * choice or a score beyond what the caller sent (AC-11). The client maps each
 * code to a message at the edge and navigates after a finish; no action
 * redirects.
 */

const decisionSchema = z.object({
  movieId: z.number().int().positive(),
  choice: z.enum(["liked", "disliked", "not_seen"]),
});

type ActionError<Code extends string> = { code: Code };

export type SwipeActionResult = Result<
  Progress,
  ActionError<
    "unauthenticated" | "invalid_input" | "movie_not_found" | "db_unavailable"
  >
>;

export type UndoSwipeActionResult = Result<
  Progress & { restored: boolean },
  ActionError<"unauthenticated" | "invalid_input" | "db_unavailable">
>;

export type FinishActionResult = Result<
  { onboardedAt: string },
  ActionError<"unauthenticated" | "not_enough_ratings" | "db_unavailable">
>;

/**
 * Saves one swipe: liked 8, disliked 2, or a skip for not seen. The movie must
 * still be listable (a withdrawn movie keeps its row, so `saveSwipe` alone would
 * not refuse it). Returns the user's new counters once the write has committed.
 */
export async function swipeAction(input: unknown): Promise<SwipeActionResult> {
  const session = await getUserForAction();
  if (!session.ok) return err({ code: "unauthenticated" });
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return err({ code: "invalid_input" });
  const { movieId, choice } = parsed.data;
  const userId = session.user.id;

  const listable = await isMovieListable(db, { movieId });
  if (!listable.ok) return err({ code: "db_unavailable" });
  if (!listable.value) return err({ code: "movie_not_found" });

  const saved = await saveSwipe(db, { userId, movieId, choice });
  if (!saved.ok) {
    return err({
      code:
        saved.error.code === "user_not_found"
          ? "unauthenticated"
          : saved.error.code,
    });
  }
  const progress = await countProgress(db, { userId });
  if (!progress.ok) return err({ code: "db_unavailable" });
  return ok(progress.value);
}

/**
 * Takes back the last swipe the browser remembers. `restored` is true only when
 * a row was deleted; when it is false the caller must not bring the card back.
 */
export async function undoSwipeAction(
  input: unknown,
): Promise<UndoSwipeActionResult> {
  const session = await getUserForAction();
  if (!session.ok) return err({ code: "unauthenticated" });
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return err({ code: "invalid_input" });
  const userId = session.user.id;

  const undone = await undoSwipe(db, { userId, ...parsed.data });
  if (!undone.ok) {
    return err({
      code:
        undone.error.code === "db_unavailable"
          ? "db_unavailable"
          : "unauthenticated",
    });
  }
  const progress = await countProgress(db, { userId });
  if (!progress.ok) return err({ code: "db_unavailable" });
  return ok({ ...progress.value, restored: undone.value.restored });
}

/**
 * Finishes onboarding. Refuses with `not_enough_ratings` unless the same rule
 * the screen uses allows it. Takes no input.
 */
export async function finishOnboardingAction(): Promise<FinishActionResult> {
  const session = await getUserForAction();
  if (!session.ok) return err({ code: "unauthenticated" });

  const finished = await finishOnboarding(db, { userId: session.user.id });
  if (!finished.ok) {
    const { code } = finished.error;
    return err({ code: code === "user_not_found" ? "unauthenticated" : code });
  }
  return ok({ onboardedAt: finished.value.onboardedAt.toISOString() });
}

"use server";

import { z } from "zod";
import { getUserForAction } from "@/auth/session";
import { db } from "@/db/client";
import { err, ok, type Result } from "@/lib/result";
import { clearFeedback, type FeedbackKind, setFeedback } from "./feedback";

/*
 * The one Server Action of feed feedback (spec 0011, AC-13). It reads the user
 * from the live session, validates its input with Zod and returns a typed
 * result. It logs nothing: no movie id, title or kind leaves this file. It does
 * not refresh any page, because a refresh reruns the recommender and reshuffles
 * the picks under the user's finger.
 */

const inputSchema = z.object({
  movieId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  kind: z.enum(["not_interested", "more_like_this"]).nullable(),
});

export type SetFeedbackResult = Result<
  { kind: FeedbackKind | null },
  {
    code:
      | "unauthenticated"
      | "invalid_input"
      | "movie_not_found"
      | "db_unavailable";
  }
>;

/**
 * Saves the signed in user's feedback on one movie, or clears it when `kind`
 * is null. Idempotent: the same call twice leaves one row. The user id comes
 * from the session only.
 */
export async function setFeedbackAction(
  input: unknown,
): Promise<SetFeedbackResult> {
  const session = await getUserForAction();
  if (!session.ok) return err({ code: "unauthenticated" });
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return err({ code: "invalid_input" });
  const { movieId, kind } = parsed.data;
  const userId = session.user.id;

  const result =
    kind === null
      ? await clearFeedback(db, { userId, movieId })
      : await setFeedback(db, { userId, movieId, kind });
  if (!result.ok) return err(result.error);
  return ok({ kind });
}

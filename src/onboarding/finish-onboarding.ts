import type { Db } from "@/db/create-db";
import type { DbUnavailable, UserNotFound } from "@/db/failure";
import { err, type Result } from "@/lib/result";
import { markOnboarded } from "@/profile/profile";
import { canFinish } from "./deck-rules";
import { loadDeck } from "./load-deck";

export type FinishOnboardingError =
  | { code: "not_enough_ratings" }
  | UserNotFound
  | DbUnavailable;

/**
 * Finishes onboarding (spec 0006, AC-7). The server checks the rule itself with
 * the same `canFinish` the screen uses, so a hand made request cannot skip the
 * minimum. Finishing again keeps the first timestamp and still succeeds.
 */
export async function finishOnboarding(
  db: Db,
  input: { userId: string },
): Promise<Result<{ onboardedAt: Date }, FinishOnboardingError>> {
  const deck = await loadDeck(db, input);
  if (!deck.ok) return err(deck.error);
  const { rated, shown, cards } = deck.value;
  if (!canFinish({ rated, shown, remaining: cards.length })) {
    return err({ code: "not_enough_ratings" });
  }
  return markOnboarded(db, input);
}

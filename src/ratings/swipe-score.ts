/** A swipe that carries a score. `not_seen` carries none, it is a skip. */
export type ScoredSwipe = "liked" | "disliked";

/** The three things a user can say about a movie in the swipe deck. */
export type SwipeChoice = ScoredSwipe | "not_seen";

/** Score saved for a liked swipe (spec 0002, Value sourcing). */
export const LIKED_SCORE = 8;

/** Score saved for a disliked swipe (spec 0002, Value sourcing). */
export const DISLIKED_SCORE = 2;

/** Maps a liked or disliked swipe to the rating score it saves. */
export function swipeScore(choice: ScoredSwipe): number {
  return choice === "liked" ? LIKED_SCORE : DISLIKED_SCORE;
}

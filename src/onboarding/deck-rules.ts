/** The least ratings a user needs before "See my picks" appears (spec 0006). */
export const MIN_RATED = 10;

/** At this many ratings the deck ends by itself. */
export const AUTO_END_RATED = 20;

/** At `MIN_RATED` ratings or more, this many cards dealt ends the deck. */
export const SHOWN_CAP = 30;

/** How many of the most voted listable movies make up the deck. */
export const POOL_SIZE = 150;

/** How long the undo toast stays, in milliseconds. */
export const UNDO_TOAST_MS = 6000;

/** The one id every undo toast uses, so the next swipe replaces the last toast. */
export const UNDO_TOAST_ID = "onboarding-undo";

/**
 * Where the deck stands. Checked in this order:
 * - `ended_pool`: no card is left.
 * - `ended_enough`: 20 ratings, or 10 ratings and 30 cards dealt.
 * - `can_finish`: 10 ratings, the deck carries on.
 * - `swiping`: not enough yet.
 */
export type DeckStatus =
  | "ended_pool"
  | "ended_enough"
  | "can_finish"
  | "swiping";

export type DeckCounts = {
  /** All of the user's ratings, whatever their source. */
  rated: number;
  /** Skips plus ratings with source `swipe`. */
  shown: number;
  /** Cards still in the deck. */
  remaining: number;
};

/**
 * The one rule behind the screen and the server check (spec 0006, AC-8 and
 * AC-9), so the two cannot disagree. Pure.
 */
export function deckStatus({
  rated,
  shown,
  remaining,
}: DeckCounts): DeckStatus {
  if (remaining <= 0) return "ended_pool";
  if (rated >= AUTO_END_RATED) return "ended_enough";
  if (rated >= MIN_RATED && shown >= SHOWN_CAP) return "ended_enough";
  if (rated >= MIN_RATED) return "can_finish";
  return "swiping";
}

/**
 * Whether "See my picks" may work. Every status allows it except `swiping`,
 * and a used up pool also needs at least one rating (an empty catalog cannot
 * be finished). Pure.
 */
export function canFinish(counts: DeckCounts): boolean {
  const status = deckStatus(counts);
  if (status === "swiping") return false;
  if (status === "ended_pool") return counts.rated >= 1;
  return true;
}

/** The counter text under the heading: "4 of 10 rated", then "12 rated". */
export function counterText(rated: number): string {
  return rated < MIN_RATED
    ? `${rated} of ${MIN_RATED} rated`
    : `${rated} rated`;
}

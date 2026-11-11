import type { TasteAnchor } from "./load-taste";
import type { Reason, TasteStrength } from "./types";
import {
  MIN_VARIETY_CAP,
  RATING_MIDPOINT,
  RATING_SPAN,
  THIN_BELOW,
} from "./weights";

/** A score of 6 or more is liked. Anything lower is disliked (AC-4). */
export function isLikedScore(score: number): boolean {
  return score > RATING_MIDPOINT;
}

/**
 * How strongly a rating pulls: 10 is +1, 1 is -1, a swipe like (8) is about
 * +0.56 and a swipe dislike (2) is about -0.78. The rating's source does not
 * matter (AC-4).
 */
export function ratingWeight(score: number): number {
  return (score - RATING_MIDPOINT) / RATING_SPAN;
}

/** The reason a pick carries when `anchor` is its best positive anchor (spec 0011, AC-8). */
export function reasonFromAnchor(anchor: TasteAnchor): Reason {
  if (anchor.source === "more_like_this") {
    const { movieId, title, releaseYear } = anchor;
    return { kind: "more_like_this", anchor: { movieId, title, releaseYear } };
  }
  const { movieId, title, releaseYear, score } = anchor;
  return {
    kind: "similar_to_liked",
    anchor: { movieId, title, releaseYear, score },
  };
}

/** `none` with no liked movie, `thin` with 1 to 4, `ok` with 5 or more (AC-7). */
export function tasteStrength(likedCount: number): TasteStrength {
  if (likedCount <= 0) return "none";
  return likedCount < THIN_BELOW ? "thin" : "ok";
}

/**
 * The most picks one anchor may be the reason for in one batch (AC-11):
 * `max(3, ceil(limit / likedAnchorCount))`.
 */
export function varietyCap(limit: number, likedAnchorCount: number): number {
  if (likedAnchorCount <= 0) return limit;
  return Math.max(MIN_VARIETY_CAP, Math.ceil(limit / likedAnchorCount));
}

/** A ranked candidate with the anchor that produced its score. */
export type Ranked = { movieId: number; anchorId: number; score: number };

/**
 * Picks up to `limit` candidates from a list already ranked best first, with no
 * anchor behind more than `cap` picks while others remain (AC-11). The first
 * pass skips a candidate whose anchor is at the cap. The second pass fills the
 * slots left, in rank order, ignoring the cap, so a batch fills whenever enough
 * candidates exist. The result is sorted by score, then movie id (AC-1).
 */
export function pickWithVariety<T extends Ranked>(
  ranked: readonly T[],
  limit: number,
  cap: number,
): T[] {
  const chosen = new Set<T>();
  const perAnchor = new Map<number, number>();
  for (const candidate of ranked) {
    if (chosen.size >= limit) break;
    const used = perAnchor.get(candidate.anchorId) ?? 0;
    if (used >= cap) continue;
    perAnchor.set(candidate.anchorId, used + 1);
    chosen.add(candidate);
  }
  for (const candidate of ranked) {
    if (chosen.size >= limit) break;
    chosen.add(candidate);
  }
  return [...chosen].sort((a, b) => b.score - a.score || a.movieId - b.movieId);
}

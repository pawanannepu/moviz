/**
 * Every scoring and timing number of bite search, in one file so a later change
 * is one edit (spec 0012). `weights.test.ts` pins them; change the spec and that
 * test together. The values are reasoned guesses, not measured.
 */

/** The most picks one search returns. */
export const BITE_RESULTS = 8;
/** How much the closest liked movie adds to the phrase similarity. The phrase leads. */
export const BITE_TASTE_WEIGHT = 0.25;
/** A reason names the closest liked movie only when its raw cosine is at least this. */
export const BITE_ANCHOR_MIN_SIMILARITY = 0.5;
/** The whole search, from the quota to the end of the Voyage step, in milliseconds. */
export const SEARCH_TIME_BUDGET_MS = 8_000;
/** The one Voyage try, in milliseconds. Words mode runs after it. */
export const VOYAGE_QUERY_TIMEOUT_MS = 5_000;

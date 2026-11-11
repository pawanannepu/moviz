/**
 * Every tuning number of the recommender, in one file so a later change is one
 * edit (spec 0007). The values are reasoned guesses, not measured.
 */

/** A rating of 5.5 is neutral: 6 and up is liked, 5 and down is disliked. */
export const RATING_MIDPOINT = 5.5;
/** Distance from the midpoint to a 1 or a 10, so weights run from -1 to +1. */
export const RATING_SPAN = 4.5;
/** How much the closest disliked movie pulls a candidate's score down. */
export const NEGATIVE_WEIGHT = 0.5;
/** How much the popularity nudge adds to a score, at most. */
export const PRIOR_WEIGHT = 0.1;
/** Vote count at which the popularity nudge stops growing. */
export const PRIOR_FULL_VOTES = 5000;
/** The most liked movies used as anchors. */
export const LIKED_ANCHORS = 30;
/**
 * The most "More like this" movies used as extra liked anchors, newest first
 * (spec 0011, AC-6). They come on top of the `LIKED_ANCHORS` rating anchors.
 */
export const MORE_LIKE_THIS_ANCHORS = 10;
/** The pull of a "More like this" anchor: the same as a rating of 10. */
export const MORE_LIKE_THIS_WEIGHT = 1.0;
/** The most disliked movies used as anchors. */
export const DISLIKED_ANCHORS = 10;
/** Fewer liked movies than this means the taste profile is thin. */
export const THIN_BELOW = 5;
/** The variety cap never goes below this many picks per anchor. */
export const MIN_VARIETY_CAP = 3;
/** Ranked candidates read from the database before the variety pass. */
export const CANDIDATE_FETCH = 300;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
/** The most already shown movie ids a caller may pass. */
export const MAX_SHOWN = 500;

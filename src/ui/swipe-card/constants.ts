/** Swipe gesture numbers (spec 0004, Swipe card details). One place to tune them. */

/** After this many pixels of movement the drag locks to one axis. */
export const AXIS_LOCK_PX = 12;

/** The least distance that commits a drag, in pixels. */
export const MIN_DISTANCE_PX = 96;

/** A sideways drag commits at this share of the card width (or the minimum). */
export const HORIZONTAL_SHARE = 0.3;

/** An upward drag commits at this share of the card height (or the minimum). */
export const VERTICAL_SHARE = 0.25;

/** A flick commits when it is at least this fast, in pixels per millisecond. */
export const FLICK_SPEED = 0.6;

/** A flick must also cover at least this many pixels. */
export const FLICK_MIN_DISTANCE_PX = 40;

/** Speed is measured over the last this many milliseconds of the drag. */
export const FLICK_WINDOW_MS = 100;

/** The pending action word shows past this share of the commit distance. */
export const PREVIEW_SHARE = 0.4;

/** The card tilts up to this many degrees, reached at the commit distance. */
export const MAX_TILT_DEG = 8;

/**
 * How long the card takes to leave, in milliseconds. Matches `--dur-card` in
 * `globals.css`; a test keeps the two equal. The deck waits this long before it
 * shows the next card, so the exit is seen.
 */
export const EXIT_MS = 220;

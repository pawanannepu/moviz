/*
 * The numbers and fixed copy of the personalized feed (spec 0008). Copy lives
 * here so the server, the client and the tests read one source.
 */

/** Picks per batch: the first load and every press of Load more. */
export const FEED_BATCH_SIZE = 24;

/** The status text for screen readers while picks load (also the retry status). */
export const LOADING_LABEL = "Loading your picks";

export const FEED_TITLE = "Your picks";

/**
 * Shown only to a browser with JavaScript off, below the heading. React keeps
 * streamed content hidden until a script moves it, so without JavaScript the
 * picks never show (spec 0008, AC-16).
 */
export const NOSCRIPT_LINE =
  "Moviz needs JavaScript to show your picks. Turn it on and reload the page.";

/** The reason on a pick that has no taste signal behind it. */
export const POPULAR_REASON = "Popular with film fans";

/** Shown above the grid when the profile is `thin` (1 to 4 liked movies). */
export const THIN_LINE =
  "Early picks from just a few ratings. They get sharper as Moviz learns your taste.";

/** Shown above the grid when the profile is `none` (no liked movie). */
export const NONE_LINE =
  "These are popular films while Moviz learns your taste.";

export const EMPTY_TITLE = "No picks yet";
export const EMPTY_BODY =
  "There are no movies to suggest right now. Check back soon.";

export const LOAD_ERROR_TITLE = "We couldn't load your picks.";
export const LOAD_ERROR_BODY = "Check your connection and try again.";

/** The announcement after Load more added `count` picks. */
export function morePicksLoaded(count: number): string {
  return count === 1 ? "1 more pick loaded" : `${count} more picks loaded`;
}

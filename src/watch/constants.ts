/**
 * Fixed numbers and words for where to watch (spec 0013). Kept in one file so
 * the copy and the freshness rules are easy to find and to test.
 */

/** A cached row younger than this is used with no TMDB call (AC-7). */
export const WATCH_TTL_HOURS = 24;
/** When TMDB fails, a row younger than this is still shown (AC-8). */
export const WATCH_STALE_MAX_DAYS = 7;
/** The one TMDB try the movie page makes, with this timeout (AC-7). */
export const WATCH_FETCH_TIMEOUT_MS = 4_000;
/** Services shown per group at most (AC-2). */
export const MAX_PROVIDERS_PER_GROUP = 8;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const WHERE_TO_WATCH_TITLE = "Where to watch";

/** The group labels, in the order they show (AC-2). */
export const GROUP_LABELS = {
  stream: "Stream",
  free: "Free",
  rent: "Rent",
  buy: "Buy",
} as const;

export const TMDB_LINK_LABEL = "See all options on TMDB";

/** The credit TMDB asks for when its watch data is shown (AC-4). */
export const JUSTWATCH_CREDIT_PREFIX = "Streaming data from";
export const JUSTWATCH_NAME = "JustWatch";
export const JUSTWATCH_URL = "https://www.justwatch.com";

export const notFoundOnStreaming = (countryName: string) =>
  `Not found on streaming in ${countryName}.`;
export const inCountry = (countryName: string) => `In ${countryName}`;
export const NO_COUNTRY_LINE = "Choose your country to see where to watch.";
export const UNAVAILABLE_LINE = "Could not load streaming services right now.";

/** The country picker (AC-6, AC-10). */
export const CHANGE_COUNTRY_LABEL = "Change country";
export const COUNTRY_SELECT_LABEL = "Country";
export const CHOOSE_COUNTRY_OPTION = "Choose a country";
export const SAVE_LABEL = "Save";
export const CANCEL_LABEL = "Cancel";
export const SAVE_ERROR = "Could not save your country. Try again.";
export const CHOOSE_FIRST = "Choose a country first.";
export const SESSION_ENDED = "Your session ended.";
export const SIGN_IN_AGAIN_LABEL = "Sign in again";

/** The id of the "In {country}" line on the movie page, where focus lands after a save. */
export const COUNTRY_LINE_ID = "where-to-watch-country";

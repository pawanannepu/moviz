/*
 * The limits and fixed copy of bite search (spec 0012). Copy lives here so the
 * server, the client and the tests read one source. Safe to import from client
 * components.
 */

/** The search page. Closed to signed out visitors like every page. */
export const SEARCH_PATH = "/search";

/** Searches per user per UTC day (spec 0002, AC-11). Enforced in the quota upsert. */
export const SEARCH_DAILY_LIMIT = 30;

/** A phrase, after trimming and collapsing spaces, is 2 to 120 characters. */
export const PHRASE_MIN_LENGTH = 2;
export const PHRASE_MAX_LENGTH = 120;
/** A reason quotes at most this many characters of the phrase, then "…". */
export const REASON_PHRASE_MAX = 40;

export const SEARCH_TITLE = "Search by mood";
export const SEARCH_LINK_LABEL = "Search by mood";
export const FIELD_LABEL = "Describe what you feel like watching";
export const SUBMIT_LABEL = "Find picks";
export const PENDING_LABEL = "Searching…";
export const EXAMPLES_LABEL = "Try one of these";

/** The example phrases. A press fills the field and does not search. */
export const EXAMPLE_PHRASES = [
  "something short and funny tonight",
  "a slow moody thriller from the 90s",
  "a feel good classic for a rainy Sunday",
] as const;

export const TOO_SHORT_MESSAGE = "Type at least 2 characters.";
export const TOO_LONG_MESSAGE = "Keep it under 120 characters.";

export const WORDS_MODE_LINE =
  "Simple search this time: these match your words, not the mood.";
export const ERROR_MESSAGE = "Search is not working right now. Try again.";
export const SESSION_ENDED_MESSAGE = "Your session ended.";
export const SIGN_IN_AGAIN_LABEL = "Sign in again";
export const EMPTY_BODY = "Try fewer or different words.";

/** Typographic quotes around a phrase. */
export const quoted = (phrase: string) => `“${phrase}”`;

export const resultsHeading = (phrase: string) => `Picks for ${quoted(phrase)}`;

export const emptyHeading = (phrase: string) =>
  `Nothing fits ${quoted(phrase)}.`;

/** The live region text when results arrive. */
export function picksAnnouncement(count: number, phrase: string): string {
  return count === 1 ? `1 pick for ${phrase}` : `${count} picks for ${phrase}`;
}

/** The "Looking for" line, or null when no filter was found (AC-5). */
export function lookingForLine(labels: readonly string[]): string | null {
  return labels.length === 0 ? null : `Looking for: ${labels.join(", ")}`;
}

/** The quota message. `time` is the next UTC midnight in the user's local time. */
export function quotaMessage(time: string): string {
  return `You have used today's ${SEARCH_DAILY_LIMIT} searches. More after ${time}.`;
}

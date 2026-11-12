/**
 * The numbers behind the word rules of `parsePhrase` (spec 0012, AC-4). The
 * tests pin them; change the spec and the tests together.
 */

/** "short" or "quick": at most this many minutes. */
export const SHORT_MAX_MINUTES = 100;
/** "long" or "epic": at least this many minutes. */
export const LONG_MIN_MINUTES = 150;
/** "old" or "classic": released before this year. */
export const OLD_BEFORE_YEAR = 1980;
/** "new" or "recent": the current UTC year or this many years before it. */
export const RECENT_YEARS = 3;
/** The earliest and latest decades a four digit decade ("1980s") may name. */
export const FIRST_DECADE = 1920;
export const LAST_DECADE = 2020;

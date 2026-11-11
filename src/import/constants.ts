/*
 * Every number the Letterboxd import uses, in one place (spec 0009,
 * "Configuration required"). Change the spec and these together.
 */

/** The biggest file the import accepts: 2 MB (spec 0001, spec 0009 AC-3). */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Room for the multipart envelope around the file when the `Content-Length` header is checked. */
export const FORM_OVERHEAD_BYTES = 16 * 1024;

/** How many saved imports a user may start in one UTC day (AC-9). */
export const MAX_IMPORTS_PER_DAY = 5;

/** How many imports a user keeps; older ones are deleted when a new one is stored (AC-10). */
export const KEEP_IMPORTS = 5;

/** Rows per insert statement (AC-16). */
export const CHUNK_SIZE = 1000;

/** Unmatched rows per page on `/import` (AC-11). */
export const UNMATCHED_PAGE_SIZE = 50;

/** An unmatched row stores at most this many characters of its title. */
export const TITLE_MAX_CHARS = 200;

/** The whole save gives up after this long, so it ends before Vercel's 60 seconds (AC-7). */
export const SAVE_BUDGET_MS = 45_000;

/** Postgres cancels any one statement of the save after this long (AC-7). */
export const STATEMENT_TIMEOUT_MS = 20_000;

/** The oldest film year a row may carry. */
export const MIN_FILM_YEAR = 1870;

/** A row may carry a year up to this many years after the current one. */
export const FILM_YEARS_AHEAD = 5;

/** The page the import lives on. */
export const IMPORT_PATH = "/import";

/** The Route Handler the form posts to. */
export const IMPORT_API_PATH = "/api/import/letterboxd";

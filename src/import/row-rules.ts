import { FILM_YEARS_AHEAD, MIN_FILM_YEAR, TITLE_MAX_CHARS } from "./constants";

/** Why a row of the file did not become a rating (spec 0009, `import_unmatched_reason`). */
export type UnmatchedReason =
  | "no_match"
  | "ambiguous"
  | "invalid_row"
  | "duplicate"
  | "kept_manual";

/** One data row of the file as text, before any rule is applied. A missing cell is an empty string. */
export type RawRow = {
  /** The row's position among data rows; the first data row is 1. */
  rowNumber: number;
  name: string;
  year: string;
  rating: string;
  date: string;
};

/** A row that passed every rule and can go to the matcher. */
export type ValidRow = {
  kind: "valid";
  rowNumber: number;
  /** The trimmed title, whole. It is cut only when stored. */
  title: string;
  year: number;
  /** Letterboxd stars times 2, 1 to 10. */
  score: number;
  /** The `Date` column at 00:00:00 UTC, or null for "use the database now()". */
  ratedAt: Date | null;
};

/** A row a rule refused. It is stored as an unmatched row with reason `invalid_row`. */
export type InvalidRow = {
  kind: "invalid";
  rowNumber: number;
  title: string;
  year: number | null;
  score: number | null;
};

export type EvaluatedRow = ValidRow | InvalidRow;

const STARS_PATTERN = /^[0-5](\.[05])?$/;
const YEAR_PATTERN = /^\d{4}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Letterboxd stars to a score. Valid stars run from 0.5 to 5 in steps of 0.5,
 * so the score runs from 1 to 10. Anything else, including blank, is null.
 */
export function parseStars(text: string): number | null {
  const trimmed = text.trim();
  if (!STARS_PATTERN.test(trimmed)) return null;
  const stars = Number.parseFloat(trimmed);
  if (stars < 0.5 || stars > 5) return null;
  return Math.round(stars * 2);
}

/**
 * A four digit year from 1870 to the current UTC year plus 5, or null. `now`
 * comes from the caller, so this stays pure.
 */
export function parseYear(text: string, now: Date): number | null {
  const trimmed = text.trim();
  if (!YEAR_PATTERN.test(trimmed)) return null;
  const year = Number.parseInt(trimmed, 10);
  const newest = now.getUTCFullYear() + FILM_YEARS_AHEAD;
  return year >= MIN_FILM_YEAR && year <= newest ? year : null;
}

/**
 * The `Date` column as 00:00:00 UTC. It must be a real calendar day that is not
 * after today's UTC date. Anything else is null, which means the database
 * `now()` is used for a new rating.
 */
export function parseRatedDate(text: string, now: Date): Date | null {
  const match = DATE_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const isRealDay =
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d);
  if (!isRealDay) return null;
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return date.getTime() <= today ? date : null;
}

/** A title cut to the stored length, by characters (not code units), so no pair is split. */
export function cutTitle(title: string): string {
  const characters = Array.from(title);
  return characters.length <= TITLE_MAX_CHARS
    ? title
    : characters.slice(0, TITLE_MAX_CHARS).join("");
}

/**
 * Applies the row rules (spec 0009, AC-4). A blank title, a rating that is not a
 * half star from 0.5 to 5, or a year that is missing or not a plausible film
 * year makes the row invalid. A valid row keeps its whole trimmed title for the
 * matcher. Pure: the clock arrives as `now`.
 */
export function evaluateRow(row: RawRow, now: Date): EvaluatedRow {
  const title = row.name.trim();
  const year = parseYear(row.year, now);
  const score = parseStars(row.rating);
  if (title === "" || year === null || score === null) {
    return { kind: "invalid", rowNumber: row.rowNumber, title, year, score };
  }
  return {
    kind: "valid",
    rowNumber: row.rowNumber,
    title,
    year,
    score,
    ratedAt: parseRatedDate(row.date, now),
  };
}

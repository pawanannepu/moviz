import { MAX_IMPORTS_PER_DAY } from "./constants";
import type { UnmatchedReason } from "./row-rules";

/*
 * Every word the import shows, keyed by code (spec 0009, "Messages"). Sentence
 * case, plain verbs, no apology (design.md, Voice). The route and the Server
 * Action return codes; the client and the page turn them into these texts.
 */

/** Every error code the import endpoint can return. */
export type ImportErrorCode =
  | "unauthenticated"
  | "bad_origin"
  | "no_file"
  | "file_too_large"
  | "looks_like_zip"
  | "not_letterboxd_ratings"
  | "empty_file"
  | "daily_limit"
  | "db_unavailable";

export const IMPORT_ERROR_CODES: readonly ImportErrorCode[] = [
  "unauthenticated",
  "bad_origin",
  "no_file",
  "file_too_large",
  "looks_like_zip",
  "not_letterboxd_ratings",
  "empty_file",
  "daily_limit",
  "db_unavailable",
];

/** The HTTP status each error code is sent with. */
export const IMPORT_ERROR_STATUS: Record<ImportErrorCode, number> = {
  unauthenticated: 401,
  bad_origin: 403,
  no_file: 400,
  file_too_large: 413,
  looks_like_zip: 422,
  not_letterboxd_ratings: 422,
  empty_file: 422,
  daily_limit: 429,
  db_unavailable: 503,
};

/** A short heading for an error, used as the title of the alert. */
export const IMPORT_ERROR_TITLES: Record<ImportErrorCode, string> = {
  unauthenticated: "You're signed out",
  bad_origin: "The upload was blocked",
  no_file: "No file chosen",
  file_too_large: "That file is too big",
  looks_like_zip: "That's the zip file",
  not_letterboxd_ratings: "We couldn't read that file",
  empty_file: "That file has no ratings",
  daily_limit: "That's all the imports for today",
  db_unavailable: "The import didn't save",
};

/**
 * The text under an error heading. `resetAt` is the time the daily limit lifts;
 * it is shown in the viewer's own time zone.
 */
export function importErrorBody(
  code: ImportErrorCode,
  resetAt?: Date | null,
): string {
  switch (code) {
    case "unauthenticated":
      return "Your session ended. Sign in again, then upload the file.";
    case "bad_origin":
      return "Reload the page and try again.";
    case "no_file":
      return "Choose your ratings.csv file first.";
    case "file_too_large":
      return "That file is over 2 MB. Upload ratings.csv from your export, not the whole export.";
    case "looks_like_zip":
      return "Unzip it and upload ratings.csv from inside.";
    case "not_letterboxd_ratings":
      return "It needs the columns Name, Year and Rating.";
    case "empty_file":
      return "Check you chose ratings.csv from your Letterboxd export.";
    case "daily_limit": {
      const when = resetAt
        ? ` Try again after ${resetAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`
        : " Try again tomorrow.";
      return `You've used today's ${MAX_IMPORTS_PER_DAY} imports.${when}`;
    }
    case "db_unavailable":
      return "None of your ratings changed. Try again in a moment.";
  }
}

/** Why a row was left out, in plain words. */
export const REASON_LABELS: Record<UnmatchedReason, string> = {
  no_match: "Not in our catalog",
  ambiguous: "More than one film fits",
  invalid_row: "We could not read this row",
  duplicate: "Repeated in your file",
  kept_manual: "You rated this by hand, so we kept your rating",
};

/** The Load more bar's texts for the unmatched list. */
export const UNMATCHED_LOAD_LABELS = {
  idle: "Load more rows",
  pending: "Loading more rows",
  error: "Try again",
} as const;

export const UNMATCHED_LOAD_MESSAGES = {
  error: "We couldn't load more rows. Check your connection and try again.",
  session_ended: "Your session ended. Sign in to see more rows.",
} as const;

export const UNMATCHED_DONE_LINE = "That's every row.";

export const IMPORT_TITLE = "Import from Letterboxd";
export const IMPORT_PROMISE =
  "Bring your Letterboxd ratings in and your picks start from your real taste.";
export const IMPORT_STEPS = [
  "On Letterboxd, open your account settings and choose Export your data.",
  "Download the zip file and unzip it.",
  "Upload ratings.csv from inside it here.",
] as const;
export const IMPORT_NOSCRIPT_LINE =
  "The import needs JavaScript. Turn it on to upload your file.";
export const FILE_FIELD_LABEL = "ratings.csv";
export const FILE_FIELD_HINT = "A CSV file up to 2 MB.";
export const SUBMIT_LABEL = "Import ratings";
export const SUBMIT_WORKING_LABEL = "Importing";
export const WORKING_STATUS =
  "Importing your ratings. This can take up to a minute.";
export const FAILED_RESULT_TITLE = "Your last import didn't save";
export const FAILED_RESULT_BODY =
  "None of your ratings changed. Choose your file and try again.";
export const NO_UNMATCHED_LINE = "Every row matched a film in the catalog.";

/** The announcement after a good import, for the live region. */
export function importedAnnouncement(matched: number, total: number): string {
  return `Imported ${matched} of ${total} ratings`;
}

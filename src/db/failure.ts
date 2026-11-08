/** Expected database failures, shared by every data function. */
export type MovieNotFound = { code: "movie_not_found" };
export type UserNotFound = { code: "user_not_found" };
export type DbUnavailable = { code: "db_unavailable" };
export type DbFailure = MovieNotFound | UserNotFound | DbUnavailable;

type PgErrorLike = { code?: unknown; constraint?: unknown; message?: unknown };

/** Drizzle wraps driver errors in `.cause`; walk down to the one from `pg`. */
function findPgError(error: unknown): PgErrorLike | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === "object" && "code" in current) {
      return current as PgErrorLike;
    }
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : null;
  }
  return null;
}

const FOREIGN_KEY_VIOLATION = "23503";

/** SQLSTATE and Node error codes that mean the database could not be reached. */
const UNAVAILABLE_CODES = new Set([
  "57P01", // admin shutdown
  "57P02", // crash shutdown
  "57P03", // cannot connect now
  "53300", // too many connections
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EPIPE",
]);

const UNAVAILABLE_MESSAGES = [
  "Connection terminated",
  "timeout exceeded when trying to connect",
  "Client has encountered a connection error",
];

/**
 * Maps a thrown database error to an expected failure, or returns null when it
 * is not one (a bug, which the caller rethrows).
 *
 * Foreign key errors (SQLSTATE 23503) map by constraint name: the movie key
 * means `movie_not_found`, the user key means `user_not_found` (for example a
 * write racing an account delete). Drizzle names them `<table>_<column>_<ref
 * table>_<ref column>_fk`. Never reads or logs row values.
 */
export function toDbFailure(error: unknown): DbFailure | null {
  const pg = findPgError(error);
  if (!pg) return null;
  const code = typeof pg.code === "string" ? pg.code : "";
  if (code === FOREIGN_KEY_VIOLATION) {
    const constraint = typeof pg.constraint === "string" ? pg.constraint : "";
    if (constraint.endsWith("_movie_id_movies_id_fk")) {
      return { code: "movie_not_found" };
    }
    if (constraint.endsWith("_user_id_user_id_fk")) {
      return { code: "user_not_found" };
    }
    return null;
  }
  if (code.startsWith("08") || UNAVAILABLE_CODES.has(code)) {
    return { code: "db_unavailable" };
  }
  const message = typeof pg.message === "string" ? pg.message : "";
  if (UNAVAILABLE_MESSAGES.some((text) => message.includes(text))) {
    return { code: "db_unavailable" };
  }
  return null;
}

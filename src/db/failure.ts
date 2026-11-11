/** Expected database failures, shared by every data function. */
export type MovieNotFound = { code: "movie_not_found" };
export type UserNotFound = { code: "user_not_found" };
export type DbUnavailable = { code: "db_unavailable" };
export type DbFailure = MovieNotFound | UserNotFound | DbUnavailable;

type PgErrorLike = { code?: unknown; constraint?: unknown; message?: unknown };

/** Drizzle wraps driver errors in `.cause`; this lists the error and its causes, outermost first. */
function errorChain(error: unknown): PgErrorLike[] {
  const chain: PgErrorLike[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current !== "object") break;
    chain.push(current as PgErrorLike);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
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
  const chain = errorChain(error);
  // The driver error is the first one in the chain that carries a `code`.
  const pg = chain.find((link) => "code" in link) ?? null;
  // `pg` throws some connection errors as plain Errors with a message and no
  // `code` ("Connection terminated unexpectedly", pool connect timeouts), so the
  // message check looks at every error in the chain.
  const messageSaysUnavailable = chain.some(
    (link) =>
      typeof link.message === "string" &&
      UNAVAILABLE_MESSAGES.some((text) =>
        (link.message as string).includes(text),
      ),
  );
  if (!pg) return messageSaysUnavailable ? { code: "db_unavailable" } : null;
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
  return messageSaysUnavailable ? { code: "db_unavailable" } : null;
}

/**
 * A clean error to throw in place of an unexpected one (a bug), so nothing
 * personal reaches a log. Drizzle puts the query and its parameters (user ids,
 * movie ids, scores) in its message and keeps them on the error, and Next.js
 * logs whatever a page or a Server Action throws. This keeps only the kind of
 * error and the SQLSTATE, with no message, parameters or `cause`. `where`
 * names the function that failed.
 */
export function unexpectedDbError(where: string, error: unknown): Error {
  const chain = errorChain(error);
  const pg = chain.find((link) => "code" in link);
  const code = typeof pg?.code === "string" ? pg.code : "none";
  const kind =
    error instanceof Error ? error.constructor.name || "Error" : typeof error;
  return new Error(`${where} failed: ${kind} (code ${code})`);
}

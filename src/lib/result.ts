/**
 * Expected failures are returned, not thrown. Every data function returns a
 * `Result`; the caller (Server Action or Route Handler) maps each error code to
 * a user message at the edge.
 */
export type Result<T, E extends { code: string }> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Wraps a success value. */
export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

/** Wraps an expected failure. */
export function err<E extends { code: string }>(
  error: E,
): { ok: false; error: E } {
  return { ok: false, error };
}

/**
 * Reads the wait time, in seconds, from the `X-Retry-After` header Better Auth
 * sets on a 429 (spec 0005, AC-11). Returns undefined when the header is
 * missing or not a number, so `toAuthError` falls back to its default wait.
 */
export function readRetryAfter(response: {
  headers: { get(name: string): string | null };
}): number | undefined {
  const header = response.headers.get("X-Retry-After");
  if (header === null) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

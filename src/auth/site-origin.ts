/**
 * Picks the origin (scheme and host) to put in links inside emails that do not
 * come from Better Auth's own URL builder. Pure.
 *
 * The request's host is used only when it is on the exact allowed list, so a
 * forged `Host` header cannot point an email link at another site. Otherwise
 * the configured fallback is used.
 */
export function pickSiteOrigin(input: {
  requestUrl: string | undefined;
  allowedHosts: readonly string[];
  /** The configured base URL, for example `BETTER_AUTH_URL`. */
  fallback: string | undefined;
}): string | undefined {
  if (input.requestUrl) {
    try {
      const { host, protocol } = new URL(input.requestUrl);
      if (input.allowedHosts.includes(host)) return `${protocol}//${host}`;
    } catch {
      // Fall through to the configured origin.
    }
  }
  if (input.fallback) {
    try {
      return new URL(input.fallback).origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

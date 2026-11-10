import {
  FORGOT_PASSWORD_PATH,
  HOME_PATH,
  RESET_PASSWORD_PATH,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  VERIFY_EMAIL_PATH,
} from "./paths";

/** Pages a person must never be sent back to after signing in. */
const AUTH_PAGES: readonly string[] = [
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  FORGOT_PASSWORD_PATH,
  RESET_PASSWORD_PATH,
  VERIFY_EMAIL_PATH,
];

/** A base only used to let the URL parser judge a path. Never leaves this file. */
const PROBE_ORIGIN = "http://moviz.invalid";

// Control characters (tabs and newlines are dropped by browsers, which can turn
// `/\t/evil.com` into `//evil.com`) and backslashes (browsers read them as `/`).
// biome-ignore lint/suspicious/noControlCharactersInRegex: this is the point of the check
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f\\]/;

/**
 * Returns `raw` when it is a plain path on this site that is safe to send a
 * person to after sign in, otherwise `HOME_PATH` (spec 0005, AC-4). Pure.
 *
 * Accepted: starts with a single `/`, no scheme, no host, no backslash or
 * control character, not an auth page, not under `/api`. Everything else,
 * including `//evil.com`, `/\evil.com` and `https://evil.com`, falls back.
 */
export function safeReturnPath(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw === "") return HOME_PATH;
  if (!raw.startsWith("/") || raw.startsWith("//")) return HOME_PATH;
  if (UNSAFE_CHARACTERS.test(raw)) return HOME_PATH;

  let parsed: URL;
  try {
    parsed = new URL(raw, PROBE_ORIGIN);
  } catch {
    return HOME_PATH;
  }
  // If the parser moved to another host, the string was not a plain path.
  if (parsed.origin !== PROBE_ORIGIN) return HOME_PATH;

  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  if (AUTH_PAGES.includes(path)) return HOME_PATH;
  if (path === "/api" || path.startsWith("/api/")) return HOME_PATH;

  // The parser removes dot segments, so `/.//evil.com` becomes `//evil.com`
  // only now. Judge what is returned, not what came in: a browser reads a
  // leading `//` as another site.
  const safe = `${parsed.pathname}${parsed.search}`;
  if (safe.startsWith("//")) return HOME_PATH;
  return safe;
}

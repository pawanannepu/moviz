import { PRIVACY_PATH, TERMS_PATH } from "@/legal/paths";
import {
  FORGOT_PASSWORD_PATH,
  RESET_PASSWORD_PATH,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  VERIFY_EMAIL_PATH,
} from "./paths";

/** Pages open to signed out visitors. Matched exactly. */
const PUBLIC_PAGES: ReadonlySet<string> = new Set([
  "/",
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  FORGOT_PASSWORD_PATH,
  RESET_PASSWORD_PATH,
  VERIFY_EMAIL_PATH,
  // The legal pages are readable before sign up (spec 0014, AC-1).
  PRIVACY_PATH,
  TERMS_PATH,
]);

/**
 * Open areas matched by prefix. `/design` is the review page (spec 0004 hides
 * it in production). `/api/auth/` is Better Auth's own routes, which do their
 * own checks. `/api/cron/` carries its own bearer secret.
 */
const PUBLIC_PREFIXES: readonly string[] = [
  "/design",
  "/api/auth/",
  "/api/cron/",
];

/** True when `path` is `prefix` itself or sits below it. */
function isUnder(path: string, prefix: string): boolean {
  const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return path === base || path.startsWith(`${base}/`);
}

/**
 * Whether a signed out visitor may open `pathname` (spec 0005, AC-8). Pure.
 * Everything that is not on the list is protected, so a new page is closed by
 * default. A path that is not recognised is treated as protected.
 */
export function isPublicPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (PUBLIC_PAGES.has(path)) return true;
  return PUBLIC_PREFIXES.some((prefix) => isUnder(path, prefix));
}

/** True for paths served by a Route Handler under `/api`. */
export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

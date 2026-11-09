import { isIP } from "node:net";

/**
 * Whether a request carries one trusted client address (spec 0005, AC-11).
 *
 * Better Auth's rate limits are per IP and read `x-forwarded-for`. Vercel
 * overwrites that header with one trusted value. Without one, the library puts
 * everyone in a single shared bucket, so one noisy visitor would lock the whole
 * site out. This mirrors the library's rule: exactly one value, and it must be
 * a real IP address. Pure, so the route guard and tests share it.
 */
export function hasTrustedClientIp(headers: {
  get(name: string): string | null;
}): boolean {
  const value = headers.get("x-forwarded-for");
  if (value === null) return false;
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const [only] = parts;
  return parts.length === 1 && only !== undefined && isIP(only) !== 0;
}

/**
 * Whether this deployment must have a trusted client address on every auth
 * request. True on Vercel (preview and production), where the header is always
 * set. False locally and in CI, where Better Auth falls back to localhost.
 */
export function requiresTrustedIp(vercelEnv: string | undefined): boolean {
  return vercelEnv === "production" || vercelEnv === "preview";
}

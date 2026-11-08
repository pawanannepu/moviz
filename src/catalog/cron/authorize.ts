import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Checks the `Authorization` header of a cron call (spec 0003, AC-10). Vercel
 * sends `Bearer ${CRON_SECRET}`. Pure apart from the constant time compare.
 *
 * Fails closed: with no secret configured every call is refused. Both sides are
 * hashed first so the compare takes the same time whatever the lengths.
 */
export function isAuthorizedCron(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (secret === undefined || secret === "" || authorization === null) {
    return false;
  }
  const digest = (value: string) =>
    createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

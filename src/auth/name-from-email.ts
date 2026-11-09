/**
 * The display name for a new account: the part of the email before the `@`.
 * Pure. The sign up form sends it and the `create.before` hook sets it again, so
 * a client cannot choose its own name (spec 0005, AC-12).
 */
export function nameFromEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  const local = at > 0 ? trimmed.slice(0, at) : trimmed;
  return local === "" ? "Movie fan" : local;
}

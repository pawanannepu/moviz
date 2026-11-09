import { nameFromEmail } from "./name-from-email";

/**
 * Forces the sign up `name` to the one the server would store (spec 0005,
 * AC-7). Better Auth builds the reply for an email that already has an account
 * from the request's own `name`, while a new account gets its name from the
 * `create.before` hook. If the two differed, anyone calling the API with an odd
 * name could tell the two cases apart. Setting `name` here, before either path
 * runs, makes both replies carry the same value. The email is lowercased the
 * way the library does it, so the two paths agree on case too.
 *
 * Pure. Returns null when the body has no usable email, so the library's own
 * input check reports it.
 */
export function withDerivedName(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.email !== "string") return null;
  return { ...record, name: nameFromEmail(record.email.toLowerCase()) };
}

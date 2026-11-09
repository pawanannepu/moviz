import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { SIGN_IN_PATH } from "./paths";

/** The signed in user and session, as Better Auth reports them. */
export type AuthSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

/**
 * Reads the live session from the database, or null when there is none. A
 * cookie that no longer maps to a live session counts as signed out. Use it in
 * pages that only branch on sign in (`/`, the auth pages). Cached for one
 * request, so several components can ask without extra reads.
 */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  return auth.api.getSession({ headers: await headers() });
});

/** What `getUserForAction` returns: the user, or a typed "not signed in". */
export type ActionUserResult =
  | { ok: true; user: AuthSession["user"] }
  | { ok: false; error: "unauthenticated" };

/**
 * The signed in user for a Server Action or Route Handler, as a typed result
 * (no redirect, no thrown exception). Reads the live session on every call, so
 * a revoked session stops working at once. The caller maps `unauthenticated`
 * to a clear message at its edge, and takes the user id from here, never from
 * the client (spec 0005, AC-8).
 */
export async function getUserForAction(): Promise<ActionUserResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "unauthenticated" };
  return { ok: true, user: session.user };
}

/**
 * Guards a protected page. Returns the user and session, or redirects to the
 * sign in page with the page's own route as `returnTo`. Each protected page
 * passes its own route constant (spec 0005, AC-8).
 */
export async function requireUser(path: string): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    redirect(`${SIGN_IN_PATH}?returnTo=${encodeURIComponent(path)}`);
  }
  return session;
}

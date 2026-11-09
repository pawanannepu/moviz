/**
 * Points a verification link at one landing page (spec 0005, AC-2, AC-3).
 * Better Auth builds the link with whatever `callbackURL` the request carried,
 * and falls back to `/` when sign in sent the email. A reused or expired link
 * would then land on the home page with no message. Setting the callback here,
 * where the email is made, covers every way a verification email is sent. It
 * does not ask the sign in form for a `callbackURL`, which would also make a
 * successful sign in redirect the browser by itself.
 *
 * Pure. The link's token does not depend on the callback, so changing it is safe.
 */
export function withVerifyCallback(url: string, path: string): string {
  const link = new URL(url);
  link.searchParams.set("callbackURL", path);
  return link.toString();
}

import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { SIGN_IN_PATH } from "@/auth/paths";
import { isApiPath, isPublicPath } from "@/auth/public-paths";
import { hasTrustedClientIp, requiresTrustedIp } from "@/auth/trusted-ip";
import { env } from "@/env";

/**
 * The default deny route guard (spec 0005, AC-8). It only looks for the
 * session cookie and never touches the database, so it is cheap. It is a fast
 * first gate, not the real check: every protected page, Server Action and
 * Route Handler still reads the live session on the server. Redirecting
 * signed in visitors away from the auth pages happens in those pages, never
 * here, so a stale cookie cannot cause a redirect loop.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  // Better Auth's rate limits are per IP. On a hosted deployment a request with
  // no trusted address would land in one shared bucket for the whole site, so
  // fail loudly instead (spec 0005, AC-11).
  if (
    pathname.startsWith("/api/auth/") &&
    requiresTrustedIp(env.VERCEL_ENV) &&
    !hasTrustedClientIp(request.headers)
  ) {
    console.error("[auth] auth request without a trusted client IP header");
    return NextResponse.json({ error: "no_trusted_ip" }, { status: 503 });
  }

  if (isPublicPath(pathname)) return NextResponse.next();
  if (getSessionCookie(request)) return NextResponse.next();

  if (isApiPath(pathname)) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const target = new URL(SIGN_IN_PATH, request.url);
  target.searchParams.set("returnTo", `${pathname}${search}`);
  return NextResponse.redirect(target);
}

export const config = {
  // Everything except Next's own assets and the files in `public/` and `app/`.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|tmdb-logo.svg).*)"],
};

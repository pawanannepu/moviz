# 0005. Email sign in

**Date**: 2026-11-09
**Status**: Accepted

## Summary

People sign up with an email and a password, confirm the email, and stay signed in for 30 days. They can sign out, and reset a forgotten password by email. Better Auth (the sign in library already chosen in spec 0001) does the work; the forms talk to its built in routes so its rate limits and bot check (Turnstile) really run. Pages that hold personal data are closed to signed out visitors. Because this holds personal data it is built to the GA tier, which ends with a security review.

## Requirements

**User stories**:
- As a new film fan, I want to create an account with just an email and a password so that I can start swiping quickly.
- As a returning user, I want to stay signed in on my device so that I do not sign in every visit.
- As a user who forgot my password, I want to reset it by email so that I get back in without asking anyone.
- As the owner of the product, I want signed out visitors kept out of personal pages and abusive traffic slowed down so that people's data and my email quota stay safe.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: Sign up takes an email and a password (at least 8 characters) and nothing else. It creates an unverified account, sends a verification email, and shows "check your inbox" in place on the form, with no session issued.
- **AC-2**: Opening the verification link within 24 hours marks the email verified, signs the user in, and lands on `HOME_PATH`. `/verify-email` has three states: an expired or invalid link shows a clear message and an email field to ask for a new link; a link for an account that is already verified (the link can be reused) shows "Already verified. Sign in."; a signed in visitor goes to `HOME_PATH`.
- **AC-3**: A user whose email is not verified cannot sign in. They see a "verify your email" message and a resend button that waits 60 seconds between sends. Each attempt also sends a fresh link.
- **AC-4**: A verified user with the right password is signed in for 30 days, renewed when used. The renewal reaches the cookie too, not only the database. They land on the page they tried to reach, else `HOME_PATH`, by a full page navigation. A wrong password and an unknown email show the same message ("Email or password is wrong"). The return path accepts only a relative path on this site.
- **AC-5**: Sign out deletes the session on the server and clears the cookie, then lands on `/` by a full page navigation. The old cookie no longer opens any protected page.
- **AC-6**: Asking for a password reset shows the same neutral message for any email. The link works for 15 minutes and once. Setting a new password (at least 8 characters) signs out every device, marks the email verified (a reset proves the person controls the inbox), then sends the user to `/sign-in?notice=password-updated`, which shows "Password updated. Sign in." An expired or used link shows a clear message and a link to ask again. The reset page removes the token from the address bar once read and sends no referrer.
- **AC-7**: Signing up with an email that already has an account looks identical to a new sign up ("check your inbox") in status, body, and fields, and creates no second account. If that account is verified, its owner gets an email saying an account already exists, with sign in and reset links. If it is not verified, its owner gets a password reset email instead, so a stranger who signed up with someone else's address cannot keep the account. The verification email says "If you did not sign up, ignore this email."
- **AC-8**: A signed out request for any page that is not on the public list is redirected to `/sign-in?returnTo=<path>`; for a protected `/api/*` path it gets a 401 JSON response. Every page, Server Action, and Route Handler that touches personal data checks the real session again on the server. A cookie that no longer maps to a live session counts as signed out and never loops.
- **AC-9**: A signed in user who opens `/`, `/sign-in`, `/sign-up`, or `/forgot-password` is redirected to `HOME_PATH`.
- **AC-10**: Every auth form is usable and accessible. It has labels, inline field errors tied to their fields, a pending state that blocks double submit, an error and success message that screen readers announce, a show password toggle, correct `autocomplete` values, and focus moves to the first error. The Turnstile widget resets after every response, because its token works once. It works with the keyboard alone at 320 px width and passes the axe scan. No raw library error code is ever shown.
- **AC-11**: Sign up and password reset requests are rejected without a valid Turnstile token. Per IP rate limits stored in Postgres apply: sign in 5 a minute, sign up 3 a minute, reset request 3 a minute, resend verification 1 a minute. A limited user sees "Too many attempts. Try again in N seconds." A request with no usable client IP is never silently put in one shared site wide bucket: a startup or test check fails if the trusted IP header is missing in production.
- **AC-12**: Creating a user also creates its `profiles` row with `terms_accepted_at` set to now and `terms_version` set to `TERMS_VERSION`, and sets `user.name` from the part of the email before the `@`. If the profile insert fails, the error is logged (without the address) and thrown, and `getProfile`'s lazy create applies `TERMS_VERSION`, so no user is left without terms fields.
- **AC-13**: Deleting a user through Better Auth's `deleteUser` requires the current password in the request (a request without one gets 400), runs spec 0002's cleanup first (token rows), and then removes the user and everything it owns (spec 0002 AC-13). No screen for it ships here; spec 17 builds that.
- **AC-14**: Verification, reset, and "account already exists" emails go out through Resend after the response is sent, so a slow send does not change response time. Every send function catches all errors and never throws, so a failed send cannot show up as a different outcome for existing and unknown emails. With no Resend key and `VERCEL_ENV` unset (local development), the link is printed to the server console instead. On Vercel (preview and production) a missing `RESEND_API_KEY` or `EMAIL_FROM` stops the app at boot, because a console fallback would put tokens in hosted logs.
- **AC-15**: The session cookie is `HttpOnly`, `Secure` outside localhost, and `SameSite=Lax`. Sessions are read from the database on every check (no cookie cache), so a revoked session stops working at once. Trusted origins are an exact list with no wildcards.
- **AC-16**: Auth events are written as structured log lines: sign up, email verified, sign in success and failure, sign out, reset requested, reset completed, account deleted. A line holds the event name, outcome code, time, and user id when known. It never holds an email, password, token, or IP address. Better Auth's own logger is pinned to `warn`, because at `info` it logs the email of a repeated sign up. Requests stopped by the rate limiter or the captcha check return before the logging hooks run and are not logged; this is accepted.

## Decision

**Chosen option**: Option 1: Better Auth email and password, with forms calling its `/api/auth/*` routes through its browser client.

Build sign up, verify, sign in, sign out, and reset as client forms on thin server pages, backed by one Better Auth config, with real session checks on the server and a default deny route guard.

**Implementation skills**: `better-auth-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-best-practices/`) · `email-and-password-best-practices` (`better-auth/skills`, `.claude/skills/email-and-password-best-practices/`) · `turnstile-spin` (`cloudflare/skills`, `.claude/skills/turnstile-spin/`) · `resend` (`resend/resend-skills`, `.claude/skills/resend/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.claude/skills/nextjs-app-router-patterns/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`)

Skill note: `turnstile-spin` can create the Turnstile widget through the Cloudflare API. Create the widget in the dashboard yourself, or review before letting the skill run.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no new tables and no migration. This feature configures and uses what exists.

| Table | Used for | Notes |
|---|---|---|
| `user` | the account | `id` text pk, `email` unique, `email_verified`, `name` (derived), `created_at` |
| `account` | password hash | N:1 to `user`, `ON DELETE CASCADE`; never exported |
| `session` | one row per signed in device | N:1 to `user`, cascade; `expires_at` 30 days after last use |
| `verification` | reset tokens | row is `identifier = reset-password:<token>`, `value = user id`; verification links are signed tokens and are not stored. Not cascaded by user id; spec 0002 deletes these on account delete |
| `rate_limit` | request counters | keyed by IP and path; expired rows need purging (Follow-up) |
| `profiles` | app profile | 1:1 to `user`, created in `databaseHooks.user.create.after` |

**State transitions**:
- Account: `unverified` (created at sign up) → `verified` (link opened within 24 hours, or a password reset completed). A verified account never goes back.
- Session: `active` → `expired` (30 days idle) or `revoked` (sign out, password reset, account delete).

**Pages** (thin pages in `src/app/`; the forms are client components in `src/auth/forms/`). After sign in, verify, and sign out the browser moves with `window.location.assign(...)` (a full navigation), so the router cache cannot show a stale page.

| Route | Public | Purpose | States |
|---|---|---|---|
| `/sign-up` | yes (signed in users redirect) | email, password, Turnstile; becomes "check your inbox" in place | idle, pending, field errors, limited, captcha failed, sent |
| `/sign-in` | yes (signed in users redirect) | email, password, link to reset; unverified panel with resend; shows the `?notice=` message | idle, pending, wrong credentials, unverified, limited, password updated |
| `/forgot-password` | yes (signed in users redirect) | email, Turnstile; neutral "if that email can be used, we sent a link" | idle, pending, limited, sent |
| `/reset-password` | yes | new password from `?token=`; Better Auth redirects here with `?token=` or `?error=`; strips the token from the URL after reading; `Referrer-Policy: no-referrer` | idle, pending, weak password, expired or used link |
| `/verify-email` | yes | landing for the verification link (see AC-2) with an email field to request a new link | expired or invalid, already verified, signed in (redirect) |
| `/home` | no | protected placeholder: "You're signed in as" plus the user's email, and a Sign out button; features 7 and 9 replace it | signed in |

**API surface**: the browser client calls Better Auth's own routes (mounted at `src/app/api/auth/[...all]/route.ts` with `toNextJsHandler`, Node.js runtime). Server code reads the session with `auth.api.getSession({ headers })`.

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/auth/sign-up/email` | POST | `email`, `password`, `name` (the client sends `nameFromEmail(email)`), `callbackURL=/verify-email`, header `x-captcha-response` | neutral success (no session) | public | 400 captcha missing, 403 captcha failed, 500 captcha service down, 400 `PASSWORD_TOO_SHORT`, 429 |
| `/api/auth/verify-email` | GET | `token`, `callbackURL` | session cookie, redirect to callback | signed token | redirect with `?error=` TOKEN_EXPIRED or INVALID_TOKEN; none for an already verified account |
| `/api/auth/send-verification-email` | POST | `email`, `callbackURL` | ok | public | 429; `USER_NOT_FOUND` and `INVALID_USER` shown as the same neutral message |
| `/api/auth/sign-in/email` | POST | `email`, `password` | session cookie | public | 401 INVALID_EMAIL_OR_PASSWORD, 403 EMAIL_NOT_VERIFIED (only after a correct password), 429 |
| `/api/auth/sign-out` | POST | cookie | cleared cookie | session | none |
| `/api/auth/get-session` | GET | cookie | session, refreshed cookie | session | none (null when signed out) |
| `/api/auth/request-password-reset` | POST | `email`, `redirectTo=/reset-password`, header `x-captcha-response` | neutral success | public | 400, 403, 500 captcha, 429 |
| `/api/auth/reset-password` | POST | `newPassword`, `token` | ok, all sessions revoked | reset token | 400 INVALID_TOKEN, 400 `PASSWORD_TOO_SHORT` |
| `/api/auth/delete-user` | POST | `password` | account removed | session | 401, 400 no password (no UI here) |

App code (all in `src/auth/`):
- `getSession()`: returns the live session or null. Used by pages that only branch (`/`, auth pages).
- `requireUser(path)`: takes the current route (each protected page passes its own route constant) and returns `{ user, session }` or redirects to `/sign-in?returnTo=<path>`.
- `getUserForAction()`: returns a typed result, `{ ok: true, user } | { ok: false, error: "unauthenticated" }`, for every later Server Action and Route Handler (no redirect, no thrown exception).
- `RenewSession`: a tiny client component placed in the protected layout. It calls `authClient.getSession()` once per page load so the refreshed cookie is written (a Server Component can extend the database row but cannot write the cookie).
- `safeReturnPath(raw)`: pure; returns `raw` only if it starts with `/`, not `//` or `/\`, has no scheme, and is not an auth route; else `HOME_PATH`.
- `isPublicPath(path)`: pure; the public list used by `src/proxy.ts`.
- `nameFromEmail(email)`: pure; the part before `@`. Shared by the sign up form and the `create.before` hook.
- `toAuthMessage(error)`: pure; maps a Better Auth error code and HTTP status to a typed `AuthError` (`invalid_credentials`, `email_not_verified`, `rate_limited` with seconds, `captcha_failed`, `invalid_input`, `token_expired`, `already_verified`, `unexpected`) and each to one plain user message.
- `AUTH_NOTICES`: the fixed copy for `?notice=` values. Only known keys render; anything else is ignored.

**Route guard** (`src/proxy.ts`, Next 16): checks the cookie with `getSessionCookie(request)` from `better-auth/cookies` (it handles the `__Secure-` prefix) and never touches the database. No cookie on a page request redirects to `/sign-in?returnTo=` unless `isPublicPath`; no cookie on a protected `/api/*` path returns 401 JSON. The public list is: `/`, `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email`, `/design` (hidden in production by spec 0004), `/api/auth/*`, `/api/cron/*` (its own bearer secret), and static assets. Everything else is protected by default. Signed in redirects away from public pages happen in the pages (real session check), never in the proxy, so a stale cookie cannot cause a redirect loop.

**Auth config** (`src/auth/auth.ts`, replaces the minimal one):
- `emailAndPassword`: enabled, `requireEmailVerification: true`, `minPasswordLength: 8`, `resetPasswordTokenExpiresIn: 900`, `revokeSessionsOnPasswordReset: true`, `sendResetPassword`, `onPasswordReset` (sets `emailVerified` true), `onExistingUserSignUp` (verified account: send "account already exists"; unverified account: send a password reset email through the library's reset flow).
- `emailVerification`: `sendOnSignUp: true`, `sendOnSignIn: true`, `autoSignInAfterVerification: true`, `expiresIn: 86400`, `sendVerificationEmail`, `afterEmailVerification` (logs the event).
- `session`: `expiresIn` 30 days, `updateAge` 1 day, no `cookieCache`.
- `rateLimit`: enabled, `storage: "database"`, `customRules` with exactly these keys: `/sign-in/email` (5 a minute), `/sign-up/email` (3), `/request-password-reset` (3), `/send-verification-email` (1). `advanced.ipAddress` keeps the default `x-forwarded-for` header (Vercel overwrites it with one trusted value). Without a trusted IP the library puts everyone in one `no-trusted-ip` bucket, so the AC-11 startup or test check guards it.
- `plugins`: `captcha({ provider: "cloudflare-turnstile", secretKey, endpoints: ["/sign-up/email", "/request-password-reset"], allowedHostnames })`. `allowedHostnames` is the production host only, set when `VERCEL_ENV` is `production`; it is unset on previews, local, and CI, which use Cloudflare's always pass test keys (their reported hostname is `example.com`). The default endpoint list also covers sign in, which is not wanted here.
- `hooks.after` (`createAuthMiddleware`) keyed on `ctx.path` writes the AC-16 events from `ctx.context.returned`; `hooks.before` on `/delete-user` returns 400 when `body.password` is missing.
- `advanced.backgroundTasks.handler: (promise) => after(promise)`, set once, so every send runs after the response.
- `logger: { level: "warn" }`.
- `databaseHooks.user.create.before` sets `name` with `nameFromEmail`; `create.after` creates the profile (spec 0002) and, on failure, logs and throws (AC-12).
- `user.deleteUser`: enabled, `beforeDelete` calls spec 0002's cleanup, `afterDelete` logs the event.
- `baseURL`: `{ allowedHosts: [host of BETTER_AUTH_URL, VERCEL_URL, VERCEL_BRANCH_URL, "localhost:3000"], protocol: "auto" }` (confirm the exact shape in the 1.7.18 types). People browse previews through the branch alias, so both Vercel hosts must be allowed. `trustedOrigins` is built from the same exact list.
- The `nextCookies()` plugin from spec 0001 is not added, because no Server Action sets a session cookie in this design.

**Email** (`src/email/`): `send.ts` (`sendEmail({ to, subject, text, html })` returns a typed result and never throws; Resend when a key is set, console only when `VERCEL_ENV` is unset) and `templates.ts` (pure functions for verify, reset, and account exists; plain HTML and text, dark themed, one link each; the verify email carries the "If you did not sign up, ignore this email" line). Preview deployments use Resend's test sender (`onboarding@resend.dev`), which delivers only to your own address. Vercel Deployment Protection can block emailed links on previews; turn it off for the auth test path or open the link while signed in to Vercel.

**Turnstile**: `src/auth/forms/turnstile.tsx` is a small client component that loads Cloudflare's script, renders the widget, returns the token, and resets itself after every response (tokens work once). The site key reaches it as a prop from the server page (read in `src/env.ts`), so no `NEXT_PUBLIC_` variable is needed. The form sends the token as the `x-captcha-response` header. Local dev and CI use Cloudflare's published always pass test keys.

**Value sourcing** (every value an action produces or needs):

| Action | Value | Source |
|---|---|---|
| any redirect after sign in | `HOME_PATH` | constant `"/home"` in `src/auth/paths.ts`; `src/ui/landing/paths.ts` imports its sign in and sign up paths from there too |
| sign in | `returnTo` | query param, passed through `safeReturnPath`; carried as a hidden form field |
| password reset done | notice text | `?notice=password-updated` mapped by `AUTH_NOTICES`; unknown values ignored |
| `requireUser` | current route | argument passed by each protected page |
| sign up | `callbackURL` | constant `"/verify-email"` |
| reset request | `redirectTo` | constant `"/reset-password"` |
| sign up | `user.name` | `nameFromEmail(email)`, sent by the client and set again by the `create.before` hook |
| sign up | `terms_version` | constant `TERMS_VERSION = "pre-launch"` in `src/auth/terms.ts`; spec 17 replaces it with the real version |
| sign up | `terms_accepted_at` | `now()` in the `create.after` hook |
| emails | link URL | Better Auth builds it from `baseURL` plus the token |
| emails | sender | `EMAIL_FROM` |
| rate limit and Turnstile | client IP | default `x-forwarded-for` as set by Vercel |
| Turnstile | site key, secret | `TURNSTILE_SITE_KEY` (server page prop), `TURNSTILE_SECRET_KEY` (auth config) |
| Turnstile | allowed hostname | production host from `BETTER_AUTH_URL`; unset elsewhere |
| limited response | seconds to wait | `X-Retry-After` header on the 429 |
| resend button | 60 second wait | client countdown from the last send, backed by the server rule in AC-11 |
| `/verify-email` resend | the email to send to | an email field the user fills in on that page |
| `/home` | the signed in email | `session.user.email` from `requireUser` |
| protected pages | user id | `requireUser()` from `auth.api.getSession` |
| profile row | `userId` | the new `user.id` in the `create.after` hook |
| base URL | per environment | `BETTER_AUTH_URL`; previews `VERCEL_URL` and `VERCEL_BRANCH_URL` |
| e2e tests | rate limit bucket | a unique `X-Forwarded-For` per test, set through Playwright `extraHTTPHeaders` |

**Key invariants**:
- One account per email (unique `user.email`, compared case insensitively; Better Auth lowercases it).
- A session exists only for a verified email.
- No auth response differs between an existing and an unknown email, except sign in with the right password on an unverified account.
- Every protected read or write gets its user id from the server side session, never from the client.
- Emails, passwords, tokens, and IP addresses never appear in logs, analytics, or error messages.

**Security model**: one role, `user`. Ownership is by `user.id` from the session; downstream features filter by it (spec 0002 AC-14). Compliance: the scope names no legal regime and spec 17 decides which applies, so this feature treats email addresses as personal data: processor listed in spec 17 (Resend), data in our Postgres only, export and delete supported (AC-13), no tracking. Defences: Turnstile on sign up and reset, database backed rate limits, no account lockout (a lockout would let anyone lock a known email out), password hashes stay in `account` and are never exported, exact trusted origins, Better Auth's origin check on its routes, and the pre hijack handling in AC-7. Residual risks, accepted: sign up costs a little more time for a new email than for an existing one (a timing difference); `send-verification-email` has no captcha, so spread out IPs can still mail an unverified address once a minute each, limited by the 7 day purge of unverified accounts; if a victim clicks a verification link that a stranger triggered, the stranger knows the password until the victim next resets it (the email wording reduces this). The GA tier adds a fresh model `/check review` that includes a security pass.

**Configuration required** (add each to `src/env.ts` and `.env.example`):
- `BETTER_AUTH_SECRET`: at least 32 characters; becomes required (generate with `openssl rand -base64 32`).
- `BETTER_AUTH_URL`: app base URL; required unless `VERCEL_ENV` is `preview` (enforced with a `superRefine` in `src/env.ts`).
- `VERCEL_URL`, `VERCEL_BRANCH_URL`: set by Vercel; optional in `env.ts`.
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`: required everywhere; `.env.example` carries Cloudflare's always pass test keys for local and CI.
- `RESEND_API_KEY`, `EMAIL_FROM`: optional when `VERCEL_ENV` is unset (local development); required when it is `preview` or `production`. Previews use `EMAIL_FROM=onboarding@resend.dev`.
- `APP_DOMAIN` from spec 0001 is dropped; `BETTER_AUTH_URL` carries the production domain.

Prerequisites outside the code: a Resend account and API key; a Cloudflare Turnstile widget (hostnames: localhost, your preview host, the production domain); Vercel env vars set per environment. A production domain verified in Resend (SPF and DKIM) is a launch blocker: you have no domain yet, so production sign up cannot email real users until you buy one and verify it.

**Critical test scenarios**:
- Happy path: sign up, open the emailed link, land signed in on `/home`, sign out, sign in again, verifies **AC-1**, **AC-2**, **AC-4**, **AC-5**
- Happy path: forgot password, open the link, set a new password, other device's session is gone, sign in with the new one and see the notice, verifies **AC-6**
- Failure: expired verification link and expired reset link both show a clear message and a way forward; a reused verify link shows "Already verified", verifies **AC-2**, **AC-6**
- Failure: unverified sign in shows the resend panel; a second resend inside 60 seconds is refused, verifies **AC-3**, **AC-11**
- Failure: sixth sign in attempt in a minute returns 429 and the form shows the wait time from `X-Retry-After`, verifies **AC-11**
- Failure: sign up and reset without a Turnstile token are rejected; the widget resets after a failed submit, verifies **AC-10**, **AC-11**
- Failure: with no trusted IP header in production the check fails loudly, verifies **AC-11**
- Failure: a thrown Resend error does not change the response for an existing versus an unknown email, verifies **AC-14**
- Auth: signed out request to `/home` redirects to `/sign-in?returnTo=%2Fhome`; a protected `/api/*` path returns 401; a forged cookie or a deleted session redirects and does not loop, verifies **AC-8**
- Auth: `returnTo=//evil.com` and `returnTo=https://evil.com` land on `HOME_PATH`, verifies **AC-4**
- Privacy: sign up with an existing email and reset for an unknown email give responses identical to the normal ones, including the `name` field, verifies **AC-6**, **AC-7**
- Security: sign up as someone else's address, then the real owner resets; the stranger's password and sessions stop working and the email is marked verified, verifies **AC-6**, **AC-7**
- Integration: `deleteUser` without a password gets 400; with one it removes token rows and all user rows, verifies **AC-13**
- Integration: a failed profile insert is logged and thrown, and `getProfile` later creates the row with `TERMS_VERSION`, verifies **AC-12**
- Accessibility: axe scan and keyboard only run of each auth page at 320 px, verifies **AC-10**
- Logs: run the flows and assert no log line holds the email, password, token, or IP, and that the Better Auth logger level is `warn`, verifies **AC-16**
- Session: an active user's cookie expiry moves forward after `RenewSession` runs, verifies **AC-4**
- Tests: every Playwright test sends a unique `X-Forwarded-For` so rate limits do not collide, verifies **AC-11**

## Build plan

Build approach: Tracer Bullet. The first slice is a thin, real thread through every layer (config, email, form, session, protected page, sign out); later slices thicken one strand each. Turnstile and the real Resend sender come last so the thread can run on localhost without any outside account, then get switched on before anything ships.

1. **Thread: sign up, verify, land signed in, sign out.**
   - Add `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` as required (with the preview exception) in `src/env.ts` and `.env.example`; add `VERCEL_URL` and `VERCEL_BRANCH_URL` optional; set the `baseURL` allowed hosts. Satisfies **AC-15**
   - Replace `src/auth/auth.ts` with the config above (email and password, verification, session, logger level, background task handler, hooks for `name` and the profile); mount `src/app/api/auth/[...all]/route.ts`; add `src/auth/client.ts` (browser client). Satisfies **AC-1**, **AC-2**, **AC-12**, **AC-15**
   - `src/email/send.ts` (never throws; console fallback only when `VERCEL_ENV` is unset) and the verification template. Satisfies **AC-14**
   - `/sign-up` page and form with the in place "check your inbox" state; `/verify-email` page with its three states and the resend email field; protected `/home` with Sign out; `getSession`, `requireUser(path)`. Satisfies **AC-1**, **AC-2**, **AC-5**
   - Auth event logging (`logAuthEvent`) through `hooks.after` and `afterEmailVerification` for these events. Satisfies **AC-16**
2. **Sign in and protect everything.**
   - `/sign-in` page and form, `safeReturnPath`, `?notice=` support, unverified panel with resend and cooldown, full page navigation after sign in and sign out. Satisfies **AC-3**, **AC-4**
   - `src/proxy.ts` with `isPublicPath` and `getSessionCookie` (401 JSON for protected `/api/*`), `getUserForAction`, `RenewSession` in the protected layout, signed in redirects on `/`, `/sign-in`, `/sign-up`, `/forgot-password`. Point `src/ui/landing/paths.ts` at `src/auth/paths.ts`. Satisfies **AC-4**, **AC-8**, **AC-9**
   - Log sign in success and failure and sign out events. Satisfies **AC-16**
3. **Password reset and the no leak rules.**
   - `/forgot-password` and `/reset-password` pages and forms (token stripped from the URL, `Referrer-Policy: no-referrer`), reset template, 15 minute token, revoke other sessions, `onPasswordReset` marks the email verified, redirect to `/sign-in?notice=password-updated`. Satisfies **AC-6**
   - `onExistingUserSignUp` with the verified and unverified branches, the client sent `name`, neutral responses everywhere. Satisfies **AC-7**
   - Log reset requested and completed events. Satisfies **AC-16**
4. **GA hardening and real email.**
   - Turnstile component (resets after each response), captcha plugin on the two endpoints with `allowedHostnames` in production, keys in env. Satisfies **AC-10**, **AC-11**
   - Rate limit `customRules` with the four exact keys, the trusted IP check, and the Playwright `X-Forwarded-For` helper. Satisfies **AC-11**
   - Resend sender, boot checks for preview and production, test sender on previews. Satisfies **AC-14**, **AC-15**
   - `deleteUser` with the password required hook, `beforeDelete` cleanup from spec 0002, and the `afterDelete` log. Satisfies **AC-13**, **AC-16**
   - Error mapping (`toAuthMessage`, `AUTH_NOTICES`), form states, accessibility pass, cookie and trusted origin checks. Satisfies **AC-10**, **AC-15**
5. **Close the GA tier**: `/check verify`, `/test`, a fresh model `/check review` with a security pass, then `/document`.

## Consequences

**Positive**:
- Rate limits and the bot check run exactly as the library tested them, with little custom security code to own.
- No new tables or migration; only config.
- Every later feature gets one safe way to ask "who is this?" (`requireUser`, `getUserForAction`) and a default deny guard for new pages.
- No existence leaks on sign up and reset, so nobody can probe who uses Moviz.

**Negative / tradeoffs**:
- Forms are client components, so they need JavaScript, and form input checks run in the browser and in the library, not in your own Server Action. The auth route is a documented exception to the "every Route Handler validates with Zod" rule, because Better Auth owns its own input checks.
- `/` and the auth pages become dynamic (they read the session), so the landing page is no longer a static page.
- A mistyped email at sign up gets no hint (the neutral message). The user finds out when no email arrives; the resend button needs the right address.
- One database read per protected request (no cookie cache). Fine at this scale; revisit with measured load.
- Without a domain, real users cannot receive email in production. This is a launch blocker, not a build blocker.
- Auth events live in Vercel's log retention only, and rate limited or captcha rejected requests are not logged. A durable audit trail is left to spec 17.
- The residual risks listed in the Security model (timing difference, no captcha on resend, a stranger's password surviving until the owner resets) are accepted.
- Preview testing of emailed links needs Vercel Deployment Protection handled and the Resend test sender, which reaches only your own address.

**Neutral**:
- This spec changes spec 0001: the `nextCookies()` plugin is not used, `trustedOrigins` has no `*.vercel.app` wildcard (any site on that host would be trusted), and `APP_DOMAIN` is dropped in favour of `BETTER_AUTH_URL`.
- `/home` is a placeholder that features 7 and 9 replace.

## Follow-up

- [ ] Amend spec 0001's *Foundation settings* for the changes above (`nextCookies()` not needed; exact `trustedOrigins`; no `APP_DOMAIN`).
- [ ] Buy a production domain, set it in `BETTER_AUTH_URL`, and verify it in Resend (SPF and DKIM) before launch.
- [ ] Create the Turnstile widget (dashboard or `turnstile-spin`) with hostnames for localhost, previews, and production.
- [ ] Confirm the exact `baseURL.allowedHosts` shape in the Better Auth 1.7.18 types while building. Already confirmed from the source: `onExistingUserSignUp` exists and runs only with `requireEmailVerification`; `EMAIL_NOT_VERIFIED` is returned only after a correct password; `beforeDelete` runs before the delete.
- [ ] Purge expired `rate_limit` rows and unverified accounts older than 7 days in the daily cron (shares the job with spec 0002's and spec 15's purges).
- [ ] Spec 17 (privacy): replace `TERMS_VERSION`, add the consent line to the sign up form, build the delete account screen with a fresh sign in step, decide a durable audit trail, list Resend and Cloudflare Turnstile as processors.
- [ ] Spec 7 and spec 9: point `HOME_PATH` at the swipe deck or the feed and replace the `/home` placeholder.
- [ ] `better-auth-best-practices`, `email-and-password-best-practices` (auth) and `resend` (email) conventions belong in `src/auth/AGENTS.md` and `src/email/AGENTS.md` once those areas exist. `turnstile-spin` belongs in `src/auth/AGENTS.md` too. `/sync` owns writing them.
- [ ] Consider installing `better-auth-security-best-practices` (`better-auth/skills`); you passed on it this round, but the GA security review may want it.

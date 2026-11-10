# Review, main (commit 1b57d2c), 2026-11-09

**Reviewed by**: Claude Sonnet 5.5, fresh reviewer (author model not recorded)
**Scope**: 86 files, commit 1b57d2c vs fb923ee (HEAD~1)
**Verdict**: Blocked

## Summary

This commit adds email sign in on Better Auth 1.7.18: sign up, verify, sign in, sign out, password reset, a default deny route guard in `src/proxy.ts`, Turnstile, database backed rate limits, Resend email, and structured auth logs. The quality is high. The security thinking is careful, the pure helper modules are small and well tested, and I checked many Better Auth internals against your assumptions and most held up. Two things need your attention before this ships. One is a real open redirect in `safeReturnPath` that I reproduced. The other is that the "unverified account takeover" defence in AC-7 silently does nothing on Vercel previews.

## Blockers

### 🔴 Open redirect after sign in through dot segments, `src/auth/return-path.ts:53`

**Problem**: `safeReturnPath` rejects a leading `//`, backslashes and control characters, then runs the string through `new URL(raw, base)` and returns `parsed.pathname + parsed.search`. The URL parser collapses dot segments, so a value like `/.//evil.com`, `/..//evil.com`, `/a/..//evil.com` or `/%2e//evil.com` passes every check (it starts with a single `/`, the origin stays the probe origin) and comes back as `//evil.com`. I ran the same logic in Node and all four returned `//evil.com`. The sign in form then calls `window.location.assign("//evil.com")` (`src/auth/forms/sign-in-form.tsx:95`), and the browser reads that as `https://evil.com`. The server side call in `src/app/(auth)/sign-in/page.tsx:29` has the same flaw, so the hidden field is poisoned before the client check even runs.

**Why it matters**: An attacker sends a victim a link like `https://moviz.example/sign-in?returnTo=/.//evil.com`. The page looks real, the victim signs in with real credentials, and then lands on the attacker's look alike site, which can say "session expired, enter your password again". This is the exact case AC-4 and the critical test scenarios say must land on `HOME_PATH`. The existing tests (`src/auth/return-path.test.ts` and the e2e list at `e2e/auth/sign-up-sign-in.spec.ts:254`) cover `//`, `https:`, backslash, control characters and `%2F%2F`, but no dot segment form, which is why it slipped through.

**Suggested fix**: Judge the result, not the input. After parsing, build the value you return and check that it still starts with exactly one `/` and not `//` (and that it has no backslash), and fall back to `HOME_PATH` if not. A stricter option is to refuse any raw value whose decoded path contains a `.` or `..` segment or an empty segment. Add the four values above, plus `/./\/evil.com`, to both the unit test and the e2e list.

## Major

### 🟠 The unverified account takeover defence does nothing on Vercel previews, `src/auth/auth.ts:162`

**Problem**: When someone signs up with an address that has an unverified account, `onExistingUserSignUp` calls `auth.api.requestPasswordReset({ body })` with no `headers` and no `request`. Because `baseURL` is the dynamic `allowedHosts` form, Better Auth needs either a request to read the host from or a `fallback` (`node_modules/better-auth/dist/api/to-auth-endpoints.mjs`, `resolveDynamicContext`). The `fallback` is only set when `BETTER_AUTH_URL` exists (`src/auth/auth.ts:130`), and `src/env.ts:76` deliberately allows it to be missing on previews. In that case the call throws "Dynamic baseURL could not be resolved for this direct auth.api call". `handleExistingUserSignUp` catches it and logs only the error name (`src/auth/existing-user.ts:50`), so nobody sees it fail.

**Why it matters**: On previews, a stranger who pre registered someone's email keeps the account, because the real owner never gets the reset email that AC-7 promises. Production is fine only because `BETTER_AUTH_URL` is required there. The security bar for this feature says AC-7 holds in every hosted environment, and the failure is silent.

**Suggested fix**: Pass the incoming request's headers (the second argument `request` that `onExistingUserSignUp` already receives) into the direct `requestPasswordReset` call, so the host comes from the allowed list. Add a test or an e2e step that runs the unverified branch with `BETTER_AUTH_URL` unset. Alternatively, make `BETTER_AUTH_URL` required on previews too, but then say so in the spec.

## Minor

### 🟡 No cap per address on emails you can trigger for someone else, `src/auth/auth.ts:196`

Every rate limit is per IP. Sign up with a victim's address sends them an "account exists" email (verified) or a reset email (unverified), and request reset sends a reset email. Turnstile and 3 a minute per IP slow this down, but spread out IPs with solved captchas can still fill one person's inbox and spend your Resend quota. The spec accepts a similar residual for resend, but not this one. Consider a small per address throttle (a counter in Postgres keyed by a hash of the address) on the two background send paths.

### 🟡 Password guessing on `/delete-user` is not covered by the tight limits, `src/auth/auth.ts:196`

`customRules` names four routes. `/delete-user` falls into the library default (about 100 requests per 10 seconds per IP). Someone holding a stolen session cookie could guess the password there far faster than the 5 a minute that sign in gets. No UI ships yet, but the route is live. Add a rule for `/delete-user` (and `/change-password` is already limited by the library's special rule), or add it to `customRules`.

### 🟡 Auth pages can be framed, `next.config.ts:4`

Only `/reset-password` gets a header. There is no `X-Frame-Options` or `frame-ancestors` anywhere, so `/sign-in`, `/sign-up` and the Sign out button on `/home` can be loaded inside another site for clickjacking. Add `frame-ancestors 'none'` (or `X-Frame-Options: DENY`) for all routes.

### 🟡 Landing page now queries the database on every visit, `src/app/page.tsx:27`

The `revalidate = 3600` line was removed because the page reads the session. `getHeroPick()` therefore runs for every signed out visitor too. The spec accepts a dynamic page, but not the extra query. Move the hero pick into its own cached function (for example `unstable_cache` or a `use cache` boundary) and leave only the session check dynamic.

### 🟡 The 7 day purge of unverified accounts that the security model leans on does not exist, `docs/specs/0005-email-sign-in/index.md:157`

The residual risk text says spread out resends are "limited by the 7 day purge of unverified accounts", but that purge is only a Follow up. Until it ships, strangers' addresses sit in `user` forever, and the auth e2e suite also leaves unverified rows behind. Either build the purge in the daily cron before launch or reword the spec.

### 🟡 The auth Playwright suite is not in CI and writes to whatever database `.env.local` points at, `playwright.auth.config.ts:20`

Much of the evidence for AC-7, AC-11, AC-15 and AC-16 lives only in `e2e/auth/`. CI runs Vitest only (`.github/workflows/ci.yml`). The auth server is started with your local `.env.local` values, so accounts and rate limit rows land in that database. Run it against the test branch (`DATABASE_URL_TEST`) and add it to CI once a database is available there.

### 🟡 `.env.example` is not part of this commit, `src/env.ts:54`

`git diff HEAD~1 HEAD` shows no change to `.env.example`, yet `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `VERCEL_URL` and `VERCEL_BRANCH_URL` are new, and `TURNSTILE_*` is required at boot. I was not allowed to open the file, so I cannot confirm whether the names were added earlier. Please check it against `src/env.ts` (the project rule and the spec both require it).

### 🟡 Console email fallback prints tokens on any host without `VERCEL_ENV`, `src/email/send.ts:30`

`pickTransport` falls back to the console whenever `VERCEL_ENV` is unset. That is right for local runs and the e2e suite, but a self hosted or Docker production start (no `VERCEL_ENV`) would put email addresses and live reset links in the logs. Hosting is Vercel today, so this is low, but a short guard such as requiring an explicit `EMAIL_TRANSPORT=console` opt in would make it safe by construction.

### 🟡 The profile hook throws after the user is already committed, `src/auth/auth.ts:247`

Better Auth queues `create.after` hooks until after the transaction commits (`db/with-hooks.mjs`). If the profile insert fails, the user row already exists, the verification email is already queued, and the new email address gets an error while an existing address gets a normal success. `getProfile` repairs the row later, so data is fine. It is only a rare, failure time difference, but it works against the neutral response rule. Consider logging and not throwing, since `getProfile` is the backstop anyway, or keep the throw and note the trade off in the spec.

## Nits

- ⚪ `src/email/send.ts:59`, no idempotency key and no timeout on the Resend call (the Resend guidance recommends both); a slow call holds the `after` task open.
- ⚪ `src/auth/auth.ts:191`, `VERCEL_ENV` is `development` in a file made by `vercel env pull`, which turns on secure cookies on plain http localhost and also removes the console email fallback; worth a line in the setup notes.
- ⚪ `src/app/(auth)/verify-email/page.tsx:38`, anyone who opens `/verify-email` with no query sees "Already verified", even without ever having a link; harmless, but the copy could be softer.

## Strengths

- The neutral response work is thorough and was checked against the library: `withDerivedName` makes new and existing sign ups return the same `name`, the library hashes the password on the existing path, the reset route fakes the lookup, and the resend route has a 500 ms floor.
- Logging is safe by construction: `formatAuthEvent` has no field for an email, token or IP, the library logger is pinned to `warn` (which hides the line that would print a repeated sign up's email), and the e2e suite asserts it.
- The route guard is default deny with an exact match public list, a cookie only check in the proxy, and the real session check in every page and in `getUserForAction`, so a stale cookie never loops. The trusted IP check mirrors the library's own rule, so the shared `no-trusted-ip` bucket cannot happen on Vercel.
- Reset handling is right: 15 minute single use token, sessions revoked, email marked verified, token stripped from the address bar, `no-referrer` header, and the neutral `?notice=` map that only renders known keys.
- Good use of small pure modules (`return-path`, `public-paths`, `site-origin`, `trusted-ip`, `auth-errors`) with focused tests. I ran the auth, email, proxy and env suites: 17 files, 222 tests pass.

## Test coverage

Vitest covers the pure logic well: `safeReturnPath` (but not dot segments, see the blocker), `isPublicPath`, `hasTrustedClientIp`, `pickSiteOrigin`, `toAuthError`, `formatAuthEvent`, the email templates, `handleExistingUserSignUp`, the proxy, `env.ts`, and the cooldown hook. The Playwright suite in `e2e/auth/` covers the flows end to end, including privacy, rate limits, origin check, delete user, logs and axe at 320 px, and it is the main evidence for the security criteria. What is missing: a test for the dot segment redirect, a test that runs the unverified sign up branch without `BETTER_AUTH_URL` (the preview case), a test that a thrown profile hook behaves as the spec says, and any CI run of the Playwright auth suite.

## Follow up notes (added by /debug, 2026-11-09)

- **Blocker, open redirect: fixed.** `safeReturnPath` now checks the value it returns, so any result that starts with `//` falls back to `HOME_PATH`. Seven dot segment cases were added to `src/auth/return-path.test.ts` (they failed before the fix) and four to the `returnTo=` list in `e2e/auth/sign-up-sign-in.spec.ts`.
- **Major, preview reset email: did not reproduce.** A server started with `VERCEL_ENV=preview` and no `BETTER_AUTH_URL` was sent a sign up and then a second sign up for the same unverified address. The send attempts went from 1 to 2, and there was no `existing user follow up failed` line. So the direct reset call works when it runs inside a real request. Nothing was changed in `src/auth/auth.ts`. A call made outside a request, such as a script, would still need headers or a `fallback`.

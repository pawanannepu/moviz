# Verify: Email sign in · spec 0005 · updated 2026-11-09
_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Milestone 2 (sign in and route guard) is below; later milestones append their own steps._

## UI / manual
- [x] Sign up, open the emailed link (printed in the dev server console), then at `/sign-in` enter the right email and password → lands on `/home` by a full page load → AC-4
- [x] At `/sign-in` enter a wrong password, then an unknown email → both show "Email or password is wrong." → AC-4
- [x] Sign in with an unverified account (right password) → "Verify your email first" panel, a fresh link is printed in the console, resend button starts in a 60 second wait → AC-3
- [x] In the unverified panel, press resend after the wait, then again at once → second press is refused or waits → AC-3, AC-11
- [x] Signed out, open `/home` → redirected to `/sign-in?returnTo=%2Fhome`; sign in → lands on `/home` → AC-4, AC-8
- [x] Open `/sign-in?returnTo=//evil.com`, `?returnTo=https://evil.com`, `?returnTo=/\evil.com`, `?returnTo=/sign-up` and sign in → each lands on `/home` → AC-4
- [x] Open `/sign-in?notice=password-updated` → shows "Password updated. Sign in."; `?notice=anything-else` shows nothing → AC-6 (copy), AC-10
- [x] Signed in, open `/`, `/sign-in`, `/sign-up` → each redirects to `/home` → AC-9
- [x] Sign out, then press Back and reload `/home` → redirected to `/sign-in`, old cookie opens nothing → AC-5, AC-8
- [x] Delete the session row in the database (cookie stays), reload `/home` → redirected to `/sign-in?returnTo=%2Fhome`, no loop; `/sign-in` and `/` render normally → AC-8
- [x] Sign in form at 320 px with keyboard only: tab order, visible focus, empty submit moves focus to the first invalid field, show password toggle works → AC-10
- [x] Sixth sign in attempt within a minute → "Too many attempts. Try again in N seconds." with N taken from `X-Retry-After` → AC-11

## Commands
- [x] `curl -i http://localhost:3000/home` → 307 to `/sign-in?returnTo=%2Fhome` → AC-8
- [x] `curl -i http://localhost:3000/api/anything` → 401 JSON `{"error":"unauthenticated"}` → AC-8
- [x] `curl -i -H "Cookie: better-auth.session_token=forged.value" http://localhost:3000/home` → 307 to `/sign-in` (page check rejects it); same cookie on `/sign-in` → 200 → AC-8
- [x] `curl -i http://localhost:3000/tmdb-logo.svg` signed out → 200 (not guarded) → AC-8
- [x] After sign in, the `sign_in` and `sign_out` log lines hold only event, outcome, time (and user id for sign in); no email, password, token or IP → AC-16
- [x] A signed in user's cookie `Expires` moves forward after `RenewSession` runs on a protected page older than 1 day → AC-4 _(2026-11-10: first run failed, the Server Component renewed the row before the client call, so no cookie was sent. Fixed by `disableRefresh` on the server reads in `src/auth/session.ts`. Rerun in Chromium: the first `get-session` carried `Set-Cookie`, cookie `Expires` moved from 12-08 to 12-10, database row renewed. Unit test `src/auth/session.test.ts`)_

## Value sourcing coverage (spec table)
- [x] `HOME_PATH` redirect after sign in: comes from `src/auth/paths.ts`; change it and confirm sign in, `/`, `/sign-in`, `/sign-up` all follow → AC-4, AC-9 _(2026-11-10: ran a scratch copy with `HOME_PATH` set to `/design`; the real sign in form landed on `/design`, and `/`, `/sign-in`, `/sign-up`, `/forgot-password` all redirected to `/design`; no literal `"/home"` exists outside `paths.ts`)_
- [x] `returnTo`: query param only, passed through `safeReturnPath`, carried as a hidden field and checked again before navigating; try an encoded `%2F%2Fevil.com` and a value with a tab or newline → lands on `/home` or stays on this site → AC-4 _(dot segment values such as `/.//evil.com` and `/..//evil.com` were found by the review and are now covered)_
- [x] `?notice=` text: only the fixed map renders; try HTML in the value → nothing rendered → AC-10
- [x] `requireUser` route: `/home` passes its own `HOME_PATH`; the redirect `returnTo` equals that route → AC-8
- [x] Protected page user id and email: `/home` shows `session.user.email` from the live session, never from the URL or the client → AC-8
- [x] Rate limit wait seconds: from the `X-Retry-After` header on the 429; with no header the form shows 60 → AC-11
- [x] Resend 60 second wait: client countdown from the last send → AC-3

## Acceptance-criteria coverage
- AC-3 covered by the unverified panel steps · AC-4 by sign in, wrong password, returnTo and renewal steps · AC-5 by the sign out and Back step · AC-8 by the redirect, 401, forged cookie and deleted session steps · AC-9 by the signed in redirect step · AC-10 (sign in form) by the keyboard step · AC-11 (sign in only) by the sixth attempt step · AC-16 (sign in, sign out) by the log step.
- Not yet covered (later milestones): AC-6, AC-7, AC-13, AC-10 and AC-11 for Turnstile, AC-14 and AC-15 hardening.

---

## Milestone 3: password reset and the no leak rules (added 2026-11-09)

### UI / manual
- [x] `/forgot-password`: enter a known email, then an unknown email → both show the same "Check your inbox" message ("If that email can be used…"); only the known one prints a reset link in the dev console → AC-6
- [x] Open the reset link within 15 minutes → lands on `/reset-password` and the address bar no longer shows `?token=` after the page loads → AC-6
- [x] Set a password under 8 characters → inline error tied to the field, focus moves to it; set a good one → lands on `/sign-in?notice=password-updated` and shows "Password updated. Sign in." → AC-6, AC-10
- [x] Open the same reset link a second time, and one older than 15 minutes (edit `verification.expires_at`) → "This link has expired or was already used" with an "Ask for a new link" link to `/forgot-password` → AC-6 _(2026-11-10: expiry set into the past in `verification`, the link redirected to `/reset-password?error=INVALID_TOKEN` and the page shows the expired message and the `/forgot-password` link)_
- [x] Sign in on two browsers, reset the password in one → the other browser's session no longer opens `/home` → AC-6
- [x] Sign up with an email, do not verify, then reset the password through the link → the reset signs the account in later without a verify step (email now verified) → AC-6
- [x] Sign up twice with the same new email → the second shows the same "Check your inbox" panel, no second `user` row; the console shows a reset email (account is unverified) → AC-7 _(2026-11-10: both calls 200 with the same body keys; the second returned a different made up id, the database holds one row, the console printed "Reset your Moviz password")_
- [x] Verify an account, then sign up again with its email → same "Check your inbox" panel; the console shows an "You already have a Moviz account" email with sign in and forgot password links, and no token → AC-7
- [x] Signed in, open `/forgot-password` → redirected to `/home`; `/reset-password` stays reachable → AC-9
- [x] Both new forms at 320 px, keyboard only: labels, visible focus, pending state blocks double submit, error is announced, show password toggle works → AC-10
- [x] Submit the sign in, sign up, forgot password and reset password forms with scripts off (a native browser submit) → each form is served with `method="post"`, the address stays clean and the password never reaches the server log (fixed by adding `method="post"`) → AC-10, AC-16

### Commands
- [x] `curl -si http://localhost:3000/reset-password | grep -i referrer-policy` → `Referrer-Policy: no-referrer` → AC-6
- [x] POST `/api/auth/request-password-reset` for a known and an unknown email → identical status and body → AC-6
- [x] POST `/api/auth/sign-up/email` for a new and an existing email → same status, same body keys, same `name` value → AC-7
- [x] Same POST with a client `name` of `zed` for both → each reply carries the name derived from its own email, never `zed` (the `name` was a way to tell the two cases apart; fixed by `src/auth/sign-up-name.ts`) → AC-7
- [x] Sign in as an unverified user, open the emailed link a second time, and open `/api/auth/verify-email?token=junk&callbackURL=%2F` style links from that email → the link carries `callbackURL=%2Fverify-email`; a reused one shows "Already verified. Sign in.", a bad one shows "This link did not work" with a field for a new link (fixed by `src/auth/verify-link.ts`) → AC-2, AC-3
- [x] After the flows, server log holds `reset_requested` and `reset_completed` lines with event, outcome, time and (for completed) user id only; no email, token or password → AC-16
- [x] Make the email sender throw (bad `RESEND_API_KEY` on a preview-like run) and repeat the sign up for a known and an unknown email → both responses stay identical → AC-14

### Value sourcing coverage (spec table)
- [x] Reset `redirectTo`: constant `/reset-password`; confirm the emailed link redirects there → AC-6
- [x] Reset done notice: `PASSWORD_UPDATED_PATH` → `?notice=password-updated` → fixed copy from `AUTH_NOTICES`; try `?notice=<b>x</b>` → nothing renders → AC-6
- [x] "Account exists" email links: built from the request host only when it is on the allowed list, else `BETTER_AUTH_URL`; send a sign up with a forged `Host` header → links use `BETTER_AUTH_URL`, not the forged host → AC-7
- [x] Reset token: comes only from the `?token=` Better Auth set; a hand typed `?token=junk` shows the form, and submitting it shows the expired message → AC-6

### Acceptance-criteria coverage (milestone 3)
- AC-6 covered by the reset, expired link, two browser and unverified owner steps · AC-7 by the duplicate sign up steps and the identical response commands · AC-9 (forgot-password) by the signed in redirect step · AC-10 (forgot and reset forms) by the 320 px step · AC-14 by the failing sender step · AC-16 (reset events) by the log step.

---

## Milestone 4: GA hardening (added 2026-11-09)

_Needs `TURNSTILE_SITE_KEY=1x00000000000000000000AA` and `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` (Cloudflare's always pass test keys) in `.env.local` and `.env.example`._

### UI / manual
- [x] `/sign-up` and `/forgot-password` load Cloudflare's script and render the widget; submit works once the token arrives → AC-10, AC-11
- [x] Submit sign up, then submit again without reloading → the widget issues a new token after each response (success or error), so the second submit is not rejected as a reused token → AC-10, AC-11
- [x] Block `challenges.cloudflare.com` (ad blocker or devtools), submit sign up and forgot password → "We could not confirm you are a person. Try again." and no request reaches Better Auth → AC-10, AC-11
- [x] Fourth sign up within a minute from one IP → "Too many attempts. Try again in N seconds." with N from `X-Retry-After` (sign up now reads it) → AC-11
- [x] Fourth reset request within a minute → same message → AC-11
- [x] Press resend verification twice within a minute → second is refused with the wait time, and the cooldown starts from that wait → AC-3, AC-11
- [x] Both Turnstile forms at 320 px, keyboard only: the widget does not break tab order or cause horizontal scroll; axe scan passes → AC-10

### Commands
- [x] `curl -si -X POST localhost:3000/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: http://localhost:3000' -d '{"email":"a@b.test","password":"password1","name":"a"}'` → 400 `MISSING_RESPONSE`; same for `/api/auth/request-password-reset` → AC-11
- [x] Same request with header `x-captcha-response: bad` and a secret that fails (use Cloudflare's always fail secret `2x0000000000000000000000000000000AA`) → 403 `VERIFICATION_FAILED` → AC-11
- [x] `/api/auth/sign-in/email` with no captcha header → not blocked by the bot check (wrong credentials give 401, not 400) → AC-11
- [x] Six sign in POSTs in a minute from one `X-Forwarded-For` → sixth is 429 with `X-Retry-After`; a different `X-Forwarded-For` is not limited → AC-11
- [ ] With `VERCEL_ENV=preview` or `production`, `curl -si localhost:3000/api/auth/get-session` with no `x-forwarded-for`, with two values, and with `not-an-ip` → each is 503 `no_trusted_ip` and logs the error; one valid IP passes → AC-11 _(two values and `not-an-ip` seen as 503 with the log line, one valid IP passed; the no header case cannot be sent because `next start` adds the socket address, still owed on a real host)_
- [x] POST `/api/auth/delete-user` signed in with `{}` and with `{"password":""}` → 400 `PASSWORD_REQUIRED`; with a wrong password → 400; with the right password → user, sessions and token rows are gone and the cookie is cleared → AC-13
- [x] Delete a user, then check the log → one `account_deleted` line with event, outcome, time and user id only → AC-16
- [x] Response cookies from sign in: `HttpOnly`, `SameSite=Lax`, `Secure` when `VERCEL_ENV` is set → AC-15
- [x] POST a sign in with `Origin: https://evil.example` → rejected by the origin check → AC-15
- [x] Boot with `VERCEL_ENV=preview` and no `RESEND_API_KEY` or `EMAIL_FROM` → app stops at boot naming the missing names; with neither `TURNSTILE_*` key → stops at boot → AC-14

### Value sourcing coverage (spec table)
- [x] Turnstile site key: reaches the widget as a prop from the server page (`env.TURNSTILE_SITE_KEY`); no `NEXT_PUBLIC_` variable exists and the secret never appears in the page source → AC-11
- [x] Turnstile secret: read only in `src/auth/auth.ts` from `env.TURNSTILE_SECRET_KEY` → AC-11
- [x] Allowed hostname: with `VERCEL_ENV=production` the plugin gets only the host of `BETTER_AUTH_URL`; unset on preview, local and CI (test keys report `example.com`) → AC-11
- [x] Client IP for limits: default `x-forwarded-for`; two requests with different values count separately, and the e2e helper (`e2e/support/unique-ip.ts`) gives every test its own → AC-11
- [x] Seconds to wait: `X-Retry-After` on sign up, reset request, sign in and resend; with no header the forms show 60 → AC-11 _(real header values seen on all four; the 60 fallback seen on all four by answering each call with a 429 that has no header)_

## Milestone 4 coverage
- AC-10 (Turnstile reset, forms) by the widget, reset and 320 px steps · AC-11 by the captcha, rate limit, trusted IP and wait seconds steps · AC-13 by the delete user steps · AC-14 by the boot check step · AC-15 by the cookie and origin steps · AC-16 (account deleted) by the delete log step.

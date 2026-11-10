# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Email sign in (see spec 0005). People can sign up with an email and a password (at least 8 characters), confirm the email with a link, stay signed in for 30 days, and sign out. Signing in with an unconfirmed email shows a "verify your email" panel with a resend button that waits 60 seconds.
- Password reset by email. Asking for a reset shows the same message for any address. The link works for 15 minutes and once, signs out every device, and counts the email as confirmed. The reset page removes the token from the address bar and sends no referrer.
- New pages: `/sign-up`, `/sign-in`, `/forgot-password`, `/reset-password`, `/verify-email`, and a signed in `/home` that shows the account email. All forms work with the keyboard at 320 px width.
- A default deny route guard (`src/proxy.ts`). A signed out visitor who opens a page that is not on the public list goes to `/sign-in` and returns to that page after signing in. A protected `/api/*` path answers 401 with JSON. Pages still check the real session on the server, so a stale cookie never causes a redirect loop.
- A Cloudflare Turnstile bot check on sign up and reset requests, and per address rate limits stored in Postgres (sign in 5 a minute, sign up 3, reset request 3, resend verification 1). A limited person sees "Too many attempts. Try again in N seconds."
- Email sending through Resend for verification, reset and "you already have an account" messages. In local development the links print to the server console instead.
- Deleting an account through Better Auth now needs the current password and clears the token rows first. No screen for it ships yet.
- Auth events are logged as structured lines (sign up, email confirmed, sign in, sign out, reset requested, reset completed, account deleted) with no email, password, token or address in them.
- A separate browser test suite for sign in: run `pnpm exec playwright test -c playwright.auth.config.ts`. It builds the app and uses Cloudflare's always pass test keys, so it works even when `.env.local` holds a real key.

### Changed

- New environment names. `BETTER_AUTH_SECRET` is now required. `BETTER_AUTH_URL` is required except on Vercel previews. `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are required. `RESEND_API_KEY` and `EMAIL_FROM` are required on Vercel previews and production, and the app refuses to start without them. Existing deployments need these set before they build.
- The landing page (`/`) now sends a signed in visitor to `/home`, and it renders on each request instead of refreshing once an hour.
- A profile created by the fallback path now carries the terms version and the time it was accepted, so no account is left without them.

### Security

- Signing up with an email that already has an account looks the same as a new sign up (same status, body and fields), so the form cannot be used to find out who has an account. If that account was never confirmed, its real owner gets a reset email, so a stranger cannot hold someone else's address.
- Fixed an open redirect after sign in. A `returnTo` value such as `/.//evil.com` or `/..//evil.com` could send a person to another site. The return path is now checked after it is cleaned up, and anything that starts with `//` goes to `/home`.
- Auth forms now use `method="post"`. A form submitted before the page's script loaded, or with scripts off, used to put the password in the address bar, where history and server logs keep it.
- Sessions are read from the database on every check, the session cookie is `HttpOnly` and `SameSite=Lax` (and `Secure` on Vercel), and trusted origins are an exact list.

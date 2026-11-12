# 0014. Privacy and legal basics: GDPR style policy and terms, an account page to export and delete, and a launch check on the legal details

**Date**: 2026-11-12
**Status**: Accepted

## Summary

Moviz gets a privacy policy at `/privacy` and terms at `/terms`, written to a GDPR style baseline (the strict common bar, since anyone can sign up), linked from the footer of every page and from a consent line on the sign up form. A new `/account` page lets a signed in user download all their data as one JSON file, change their country, and delete their account after typing their password. The operator name, contact email and backup window are placeholders in one file, and a production build on Vercel fails until they are filled, so the site cannot launch with blanks.

## Requirements

Seeded from scope feature 17 ("Privacy and legal basics", tier GA). Its done line: policy and terms pages are linked from sign up, a user can download their data and delete their account with all their ratings removed, and a signup consent line is present. Spec 0002 already built `exportUserData` and `deleteAccount` with a completeness test, and left these to this spec: the legal regime, the list of processors, whether delete needs a fresh sign in (recommended yes), retention for `rate_limit` rows, the Neon restore window, and a rule against copying production data into other branches. Spec 0005 already wired Better Auth's `deleteUser` to `deleteAccount` and requires the current password on `/delete-user`.

**User stories**:
- As a film fan, I want to read what Moviz does with my data in plain words before I sign up so that I can decide to trust it.
- As a film fan, I want to download everything Moviz holds about me so that I can keep it or take it elsewhere.
- As a film fan, I want to delete my account and know my ratings are gone so that I can leave cleanly.
- As the operator, I want the site to refuse to launch with placeholder legal details so that I never publish a policy with blanks.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: `/privacy` and `/terms` are public pages (added to `src/auth/public-paths.ts`), Server Components with static content from `src/legal/`. Each has one `h1` ("Privacy policy", "Terms of use"), a "Last updated" date from `LEGAL_UPDATED_ON`, and section headings in order. Both render for signed out and signed in visitors and pass axe.
- **AC-2**: The privacy policy covers, each under its own heading: who runs Moviz and how to contact them (`OPERATOR_NAME`, `CONTACT_EMAIL`); what data is collected (account email and name, password hash, ratings and swipes, watchlist, skips, feedback, imports and their unmatched rows, country and how it was set, search counts, sessions with their IP address and browser user agent, email verification and reset records that hold the email, IP based rate limit records); why, with the legal basis for each (providing the service for account and taste data; legitimate interest for security, bot checks and rate limits); the processors from `PROCESSORS` (Neon for the database, Vercel for hosting and the IP country, Resend for email, Voyage AI for embedding search phrases, Cloudflare Turnstile for the bot check), and TMDB as the image host (the browser loads posters and service logos straight from TMDB's image servers, which see the IP address and user agent), each with what it receives; that TMDB and JustWatch receive no account or taste data; retention (account data until deletion; search counts 30 days; rate limit records 1 day; expired sessions and verification records 1 day after they expire; backups up to `BACKUP_RETENTION_DAYS` after deletion); cookies (only the sign in session cookie and the Turnstile check, no analytics or advertising cookies, so no cookie banner); the user's rights (access through download, erasure through delete, correction of country on the account page, and anything else through `CONTACT_EMAIL`, with the right to complain to a data protection authority); international transfers in plain words; and that Moviz is not meant for people under 16.
- **AC-3**: The terms cover, each under its own heading: what Moviz is (free, no paid plans); the account and its security; acceptable use (no scraping, no automated sign ups, no abuse of the search or import); the movie data credit (TMDB, and JustWatch for streaming data) and that recommendations come with no guarantee; that the service is provided as is and can change or stop; how either side can end the account; changes to the terms (the `TERMS_VERSION` shown and dated); and the contact email.
- **AC-4**: The site footer on every page shows "Privacy" and "Terms" links above the TMDB notice, as a `<nav aria-label="Legal">` inside the existing `<footer>` that `TmdbAttribution` renders (one footer landmark, not two).
- **AC-5**: The sign up form shows, directly above the "Create account" button, "By creating an account, you agree to the Terms of use and the Privacy policy." with both names as links that open in a new tab, each carrying visually hidden text "(opens in a new tab)". `src/auth/terms.ts` becomes `export { LEGAL_UPDATED_ON as TERMS_VERSION } from "@/legal/operator"`, so the two can never drift, and new profiles record it (spec 0005, AC-12). `LEGAL_UPDATED_ON` is a `YYYY-MM-DD` string, shown on the pages as "12 November 2026".
- **AC-6**: `/account` is a signed in page (closed by the route guard, `requireUser` on the page) titled "Account", linked as "Account" from `FeedHeader` (the header every signed in page uses), and it renders `FeedHeader` itself. It shows the signed in email, then three sections in order: "Your data", "Country", "Delete account". It does not require onboarding.
- **AC-7**: "Your data" has a "Download my data" link to `GET /api/account/export`, a plain `<a href download>` (not `next/link`, whose prefetch would call the route). The Route Handler reads the live session, returns 401 with a JSON error and no body data when there is none or when `exportUserData` returns `user_not_found`, and otherwise returns the `UserExport` JSON from `exportUserData` (spec 0002) with `Content-Type: application/json`, `Content-Disposition: attachment; filename="moviz-data-YYYY-MM-DD.json"` (the date part of the document's own `exportedAt`), and `Cache-Control: no-store`. A database failure returns 503 with a JSON error; the page shows nothing extra because the browser stays on the page. It writes one log line through `logAuthEvent` with a new event name `data_exported` (added to `AuthEventName` and `formatAuthEvent` in `src/auth/log-auth-event.ts`): `{ event, outcome, userId }` and nothing else.
- **AC-8**: "Country" shows the current country name (or "Not set") and reuses `CountryPicker` from spec 0013, saving through `setCountryAction`.
- **AC-9**: "Delete account" explains in one paragraph what is removed (the account, every rating, list, import, feedback and search count) and that it cannot be undone, then a password field ("Your password", `autoComplete="current-password"`) and a "Delete my account" destructive button. Submitting calls Better Auth's `deleteUser` with the password, which runs `deleteAccount` in one transaction (spec 0005). The password is the fresh sign in check: no separate sign in step.
- **AC-10**: On success the session ends and the form does a full page load to `/?deleted=1` (`window.location.assign`, so the in memory feed and search stores are dropped). The landing page reads `searchParams` on the server and renders the status line "Your account and all its data are deleted." inside a `role="status"` region. Afterwards no row in any user table holds the user id (the completeness test from spec 0002 proves this per table).
- **AC-11**: Delete failures show one inline line above the button and keep the user on the page with focus on that line: a wrong password gives "That password is not right."; an empty password gives the field error "Enter your password."; a rate limit gives "Too many tries. Wait a minute and try again." (Better Auth's per IP limit for `/delete-user` is set to 5 tries per 60 seconds in `rateLimit.customRules` in `src/auth/auth.ts`; today the route only has the default of 100 per 10 seconds, which leaves password guessing open); any other failure gives "Could not delete your account. Try again." While pending, the button reads "Deleting…" and is `aria-disabled`, and a second submit does nothing.
- **AC-12**: `src/legal/operator.ts` holds `OPERATOR_NAME`, `CONTACT_EMAIL` and `BACKUP_RETENTION_DAYS` as clearly marked placeholders (`"OPERATOR_NAME"`, `"CONTACT_EMAIL"`, `null`) and exports `missingLegalDetails()`, a pure function returning the names still unfilled. The pages render a placeholder as the visible text "[to be filled before launch]". `operator.ts` has no imports, so `next.config.ts` can import it by relative path (`./src/legal/operator.ts`, since the `@/` alias does not work in the config). It also exports `assertLegalDetailsForBuild(env)`, a pure function that throws with a message naming the missing details when `env.VERCEL === "1"` and `env.VERCEL_ENV === "production"` and `missingLegalDetails()` is not empty. `next.config.ts` calls it with `process.env`, so a production deploy on Vercel cannot succeed with placeholders. Local, CI and preview builds are not blocked.
- **AC-13**: Retention matches the policy: the daily cron's `purgeOldRows` (built in spec 0012, AC-16) deletes `search_usage` rows older than 30 days, `rate_limit` rows older than one day, and `session` and `verification` rows more than one day past `expires_at`. The policy reads the same exported constants, so the numbers cannot drift.
- **AC-14**: No log line, error body or analytics event from these pages or routes holds an email, a password, a rating or any export content. The export response is never cached (`no-store`) and is only ever built for the session user.

## Decision

**Chosen option**: Option 2: static policy and terms written to a GDPR style baseline, an account page that wraps the export and delete functions spec 0002 already built, with the legal details in one file and a production build check.

Almost all the hard parts (complete export, complete delete, the password check) already exist and are tested; this spec gives them a screen, a route and honest words.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.claude/skills/nextjs-app-router-patterns/`) · `better-auth-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-best-practices/`) · `email-and-password-best-practices` (`better-auth/skills`, `.claude/skills/email-and-password-best-practices/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.claude/skills/playwright-best-practices/`)

**Calls made in design** (settled here so the build does not guess):

| Topic | Pick | Why | Runner up |
|---|---|---|---|
| Legal regime | GDPR style baseline (engineer's pick) | Public product open to anyone; the strict bar covers most places | A minimal plain policy |
| Legal details | Placeholders in `src/legal/operator.ts`, production build fails until filled (engineer's pick) | One place to edit; no launch with blanks | Env vars |
| Fresh sign in before delete | The current password, already required by the `/delete-user` hook | Proves it is the person, no extra screen | Sign out and back in first |
| Delete confirmation | Password only, no "type DELETE" box | The password already stops accidents; one fewer step is kinder to keyboard users | A typed confirmation word |
| Export delivery | `GET` Route Handler with an attachment header, from a plain link | Works without JavaScript; the browser handles the download | A Server Action returning a blob |
| Export streaming | Build the JSON in one go, not streamed | `exportUserData` returns one object; even a large import is far below Vercel's response limit at the 20,000 row import cap | Stream the JSON (spec 0002 suggested it; revisit if a real account nears the limit) |
| Audit record | One log line per export (`data_exported`) and the existing `account_deleted` line, ids only | Enough to answer "did this happen" without storing personal content | An audit table |
| Export rate limit | None | Signed in, read only, one transaction; no cost to abuse beyond the user's own data | A per user limit |
| Content home | `src/legal/` (operator details, processors, the two content components) | Folder by feature | Markdown files |
| Production data rule | Written into root `AGENTS.md` by `/sync`: never branch production data into dev or preview | An ops rule, not code | A Neon setting |

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no schema change. The pages read `user` (email), `profiles` (country) and, through `exportUserData`, every user table. Deletion goes through the existing `deleteAccount`. Retention uses the purge from spec 0012.

**State transitions** (the delete form): `idle` → `pending` → `deleted` (navigate to `/?deleted=1`) or `error` (one of the AC-11 lines) → `pending` on a new submit.

**API surface**:

| Function or route | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/privacy`, `/terms` | Server Component pages | none | static content | public | none |
| `/account` | Server Component page | none | email, country, the export link, `CountryPicker`, `DeleteAccountForm` | `requireUser` | redirect to sign in |
| `GET /api/account/export` (`src/app/api/account/export/route.ts`, body in `src/account/handle-export.ts`) | Route Handler, Node runtime | the session cookie | 200 JSON attachment | live session | 401 `unauthenticated`, 503 `db_unavailable` |
| `DeleteAccountForm` (`src/account/delete-account-form.tsx`) | client component | none | calls `authClient.deleteUser({ password })`, then navigates | Better Auth checks the session and password | the AC-11 cases, mapped from Better Auth error codes (`INVALID_PASSWORD`, `PASSWORD_REQUIRED`, status 429) |
| `missingLegalDetails()` (`src/legal/operator.ts`) | pure | none | `string[]` | n/a | none |
| `assertLegalDetailsForBuild(env)` (`src/legal/operator.ts`) | pure | `{ VERCEL?, VERCEL_ENV? }` | nothing, or throws with the missing names | n/a | build failure |
| `next.config.ts` | build time | `process.env` | calls `assertLegalDetailsForBuild` | n/a | build failure |
| `LegalLinks` (`src/legal/legal-links.tsx`) | Server Component | none | the two footer links | n/a | none |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Policy and terms | operator name, contact email, backup days | `src/legal/operator.ts` constants (filled by the engineer before launch) |
| Policy and terms | "Last updated" | `LEGAL_UPDATED_ON` in `src/legal/operator.ts`, set when the text changes |
| Policy | processors and what each receives | `PROCESSORS` in `src/legal/processors.ts` |
| Policy | retention periods | constants exported by spec 0012's purge: `SEARCH_USAGE_KEEP_DAYS` (30) and `RATE_LIMIT_KEEP_DAYS` (1) in `src/user-data/purge-old-rows.ts`, plus `BACKUP_RETENTION_DAYS` |
| Sign up | the terms version saved | `TERMS_VERSION` in `src/auth/terms.ts`, equal to `LEGAL_UPDATED_ON` |
| Account page | email | the live session user |
| Account page | country and its name | `getProfile(...).country`, named with `Intl.DisplayNames` |
| Export | the document | `exportUserData` for the session user id |
| Export | file name date | the first 10 characters of the document's `exportedAt` (UTC) |
| Delete | the password | the form field, sent only to Better Auth |
| Delete | success status line | `?deleted=1` on `/`, read by the landing page |
| Build check | whether this is a production Vercel build | `process.env.VERCEL` and `process.env.VERCEL_ENV` read in `next.config.ts` (build time, outside `src/env.ts` on purpose, because config runs before the app) |

**Key invariants**:
- The export only ever contains the session user's data, and never password hashes, tokens or verification rows (spec 0002).
- After a successful delete, no user table holds the user id (the completeness test).
- The policy's retention numbers and the purge use the same constants.
- A production Vercel build never ships with placeholder legal details.
- The legal pages are reachable without signing in, from every page.

**Security model**:
- Compliance scope: GDPR style baseline. The data is personal (email, taste history, approximate location through country, IP addresses in rate limit rows). No special category data.
- The export route is a `GET` that returns data only to the cookie's own session; a cross site page cannot read the response, and `no-store` keeps it out of caches.
- Deleting needs a live session and the current password (the `/delete-user` hook from spec 0005), and Better Auth's own rate limit applies to that route.
- Audit: `data_exported` and `account_deleted` log lines carry the user id and outcome only. They live in Vercel's logs for Vercel's retention period, which the policy covers under hosting.
- Nothing from these flows goes to analytics (there is none).

**Configuration required**: none new at runtime. Before the first production deploy the engineer fills `OPERATOR_NAME`, `CONTACT_EMAIL` and `BACKUP_RETENTION_DAYS` (the point in time restore window of the Neon plan, from the Neon console) in `src/legal/operator.ts`.

**Critical test scenarios** (each maps to an acceptance criterion):
- Pure: `missingLegalDetails()` lists each placeholder and returns empty when all are filled; the config check throws only for `VERCEL=1` with `VERCEL_ENV=production`, verifies **AC-12**
- Pages (component and browser): `/privacy` and `/terms` render signed out with every required heading and pass axe; the footer links show on `/`, `/sign-in` and `/home`, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**
- Sign up (browser): the consent line and both links are present above the button; a new profile records the new `TERMS_VERSION`, verifies **AC-5**
- Export (route): no session gives 401 with no data; a user with rows in every table gets the full document with the attachment headers and `no-store`; the log line holds only the event, outcome and id, verifies **AC-7**, **AC-14**
- Delete (browser, `e2e/auth/`): a wrong password shows "That password is not right." with focus on it and keeps the account; the right password lands on `/` with the status line; signing in again with that email fails, verifies **AC-9**, **AC-10**, **AC-11**
- Delete (database): after `deleteAccount`, the completeness test finds no rows for the user in any user table, including `search_usage`, `feed_feedback` and import rows, verifies **AC-10**
- Account page: signed out visitors go to sign in; the country section saves through the picker, verifies **AC-6**, **AC-8**
- Retention (database): the purge deletes `rate_limit` rows older than a day, verifies **AC-13**

## Build plan

Ordered as a Tracer Bullet: task 1 makes one thin thread work end to end (a visitor can read the policy and terms from any page and sign up agreeing to them), then later tasks thicken one strand at a time. Shared files this touches: `src/auth/auth.ts` (the `/delete-user` rate limit), `src/auth/terms.ts`, `src/auth/log-auth-event.ts` (the new event), `src/auth/public-paths.ts`, `src/catalog/tmdb-attribution.tsx` (the legal nav), `src/feed/feed-header.tsx` (the link), the landing page, `next.config.ts`.

1. Thin thread: `src/legal/` with `operator.ts` (placeholders, `LEGAL_UPDATED_ON`, `missingLegalDetails`), `processors.ts`, the privacy and terms content, the `/privacy` and `/terms` pages, the public paths, `LegalLinks` in the footer, the sign up consent line, and the new `TERMS_VERSION`. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**
2. Launch check: the `next.config.ts` build check and its unit test. Satisfies **AC-12**
3. Account page and export: `/account` with its links from the headers, the email, the country section reusing `CountryPicker`, the export Route Handler and its log line. Satisfies **AC-6**, **AC-7**, **AC-8**, **AC-14**
4. Delete: the `/delete-user` rate limit rule, `DeleteAccountForm` with the password field, the error mapping, pending state and focus, the `/?deleted=1` status line on the landing page. Satisfies **AC-9**, **AC-10**, **AC-11**
5. Retention: confirm the policy reads the purge constants from spec 0012 and that the purge covers every period the policy states. Satisfies **AC-13**
6. Browser and accessibility pass in `e2e/` (public pages) and `e2e/auth/` (account, export, delete) with axe; then `/sync` adds the production data rule to root `AGENTS.md` and a `src/legal/AGENTS.md`. Satisfies **AC-1** to **AC-14** (verification)

## Consequences

**Positive**:
- Users can read, download and delete, which is the core of what a GDPR style policy promises, using functions that are already complete and tested.
- The launch check makes forgetting the legal details impossible on production.
- Retention is honest because the policy and the purge share numbers.

**Negative / tradeoffs**:
- The policy and terms are written by an engineer, not a lawyer. They are a sound baseline, not legal advice; a review is worth it before any growth.
- Deleted data can survive in Neon's restore window for up to `BACKUP_RETENTION_DAYS`, which the policy must state.
- Vercel's request logs keep user ids from the log lines for Vercel's retention period.
- No audit table: proving an export or deletion months later depends on log retention.
- The build check reads `process.env` in `next.config.ts`, outside `src/env.ts`, a deliberate exception to the env rule.
- The export is built in memory, not streamed, unlike spec 0002's suggestion.

**Neutral**:
- No schema change.
- The account page becomes the home for future personal settings.
- `TERMS_VERSION` changes, so profiles created before this ship keep `pre-launch` as their recorded version.

## Follow-up

- [ ] Fill `OPERATOR_NAME`, `CONTACT_EMAIL` and `BACKUP_RETENTION_DAYS` in `src/legal/operator.ts` before the first production deploy (the build will refuse otherwise).
- [ ] Have someone with legal knowledge read the policy and terms before any real growth.
- [ ] Decide whether users who signed up under `pre-launch` terms need to accept the published terms on their next visit.
- [ ] Stream the export if a real account ever nears Vercel's response size limit.
- [ ] After the build, `/sync` should add the production data rule to root `AGENTS.md` and add `src/legal/AGENTS.md` and `src/account/AGENTS.md`.

# Verify: Privacy and legal basics · spec 0014 · updated 2026-11-12
_Steps derived from spec 0014 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Signed out, open `/privacy` and `/terms` → 200, one `h1` ("Privacy policy", "Terms of use"), "Last updated 12 November 2026", the section headings in the AC order, axe clean → AC-1
- [x] Signed in, open `/privacy` and `/terms` → same pages render, no redirect → AC-1
- [x] On `/privacy`, read each section → who runs Moviz and contact, what is collected, legal basis, the five processors plus TMDB as image host, "TMDB and JustWatch never receive", retention, cookies (no banner), rights, transfers, under 16 → AC-2
- [x] On `/terms`, read each section → free, account, acceptable use, TMDB and JustWatch credit, as is, ending, the version date, contact → AC-3
- [x] On `/`, `/sign-in`, `/home` and `/privacy`, inspect the footer → one `contentinfo`, a `nav` named "Legal" with "Privacy" and "Terms" above the TMDB notice → AC-4
- [x] On `/sign-up` → "By creating an account, you agree to the Terms of use and the Privacy policy." directly above "Create account"; both links open a new tab and are announced "(opens in a new tab)" → AC-5
- [x] Sign up a new account, then read its `profiles.terms_version` → `2026-11-12` (equal to `LEGAL_UPDATED_ON`) → AC-5
- [x] Signed out, open `/account` → redirect to `/sign-in?returnTo=%2Faccount` → AC-6
- [x] Signed in but not onboarded, open `/account` → page opens (no onboarding gate), title "Account", the email, then "Your data", "Country", "Delete account"; the header shows an "Account" link → AC-6
- [x] Press "Download my data" → a file `moviz-data-YYYY-MM-DD.json` downloads holding only this user's data, no password hash or tokens → AC-7, AC-14
- [x] Country section shows the current country name or "Not set"; "Change country", pick Canada, Save → line reads "Current country: Canada", takes focus, and stays after a reload → AC-8
- [x] Delete with an empty password → field error "Enter your password." with focus on the field → AC-11
- [x] Delete with a wrong password → "That password is not right." above the button, focused; account still works → AC-11
- [x] Six wrong tries inside a minute → "Too many tries. Wait a minute and try again." → AC-11
- [x] While a delete is pending → button reads "Deleting…", `aria-disabled`, a second press does nothing → AC-11
- [x] Delete with the right password → full page load to `/?deleted=1` with "Your account and all its data are deleted." in a `role="status"` region; signing in again fails → AC-9, AC-10
- [x] Open `/?deleted=yes` → no status line (only the fixed value shows it) → AC-10

## Commands
- [x] `curl -i http://localhost:3000/api/account/export` with no cookie → 401 JSON, no user data → AC-7
- [x] Signed in `GET /api/account/export` → 200, `Content-Type: application/json`, `Content-Disposition: attachment; filename="moviz-data-<exportedAt date>.json"`, `Cache-Control: no-store` → AC-7, AC-14
- [x] With the database unreachable, `GET /api/account/export` → 503 `{"ok":false,"error":"db_unavailable"}` → AC-7
- [x] Server log after an export → one line `{type, event: "data_exported", outcome, at, userId}` and nothing else → AC-7, AC-14
- [x] `VERCEL=1 VERCEL_ENV=production pnpm build` with placeholders → fails naming `OPERATOR_NAME, CONTACT_EMAIL, BACKUP_RETENTION_DAYS` → AC-12
- [x] `VERCEL=1 VERCEL_ENV=preview pnpm build` and plain `pnpm build` → not blocked by the legal check → AC-12
- [x] `pnpm test src/legal` → `missingLegalDetails` and `assertLegalDetailsForBuild` pass → AC-12
- [x] `pnpm test src/user-data` → the delete completeness test finds no rows for a deleted user in any user table, including `search_usage`, `feed_feedback` and import rows → AC-10
- [x] Read `src/legal/privacy-policy.tsx` → retention numbers import `SEARCH_USAGE_KEEP_DAYS`, `RATE_LIMIT_KEEP_DAYS`, `EXPIRED_AUTH_KEEP_DAYS` from `src/user-data/purge-old-rows.ts`; the purge deletes each of those periods → AC-13
- [x] `pnpm exec playwright test e2e/legal.spec.ts` → all pass → AC-1, AC-2, AC-4, AC-5, AC-10
- [x] `pnpm exec playwright test -c playwright.auth.config.ts e2e/auth/account.spec.ts` → all pass → AC-6, AC-7, AC-9, AC-10, AC-11, AC-14

## Value sourcing
- [ ] Change `OPERATOR_NAME` in `src/legal/operator.ts` → the policy shows the new name; set it back to the placeholder → "[to be filled before launch]"
- [ ] Change `LEGAL_UPDATED_ON` → both pages' "Last updated" and the terms version change together, and a new profile records the new value
- [ ] Remove a processor from `PROCESSORS` → it disappears from the policy list
- [ ] Change `SEARCH_USAGE_KEEP_DAYS` → the policy's search count period changes with it
- [ ] Account page email comes from the live session; country from `getProfile(...).country`, named in English ("US" → "United States", none → "Not set")
- [ ] Export file name date equals the first 10 characters of the document's `exportedAt` (UTC), checked near midnight UTC
- [ ] The delete password goes only to `/api/auth/delete-user` (check the network tab: no other request carries it)
- [ ] The build check reads only `VERCEL` and `VERCEL_ENV`; `VERCEL_ENV=production` without `VERCEL=1` is not blocked

## Acceptance-criteria coverage
- AC-1 to AC-5 · UI steps 1 to 7, e2e/legal.spec.ts · AC-6 · steps 8, 9 · AC-7 · step 10, command steps 1 to 4 · AC-8 · step 11, e2e/auth/account.spec.ts · AC-9, AC-10 · steps 16, 17, completeness test · AC-11 · steps 12 to 15 · AC-12 · command steps 5 to 7 · AC-13 · command step 9 · AC-14 · steps 10, command steps 2, 4

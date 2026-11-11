# Verify: Letterboxd CSV import · spec 0009 · updated 2026-11-11
_Steps derived from spec 0009 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Setup for the browser steps: run `pnpm exec playwright test -c playwright.auth.config.ts` style sessions (production build on port 3101), or `pnpm dev` with a verified account. Make a `ratings.csv` from the catalog: 12 real catalog titles with their years and ratings of 3 and 4.5, plus one title that is not in the catalog, one row with rating 3.3 and one row with a blank title.

## UI / manual
- [x] Sign in as a new user, press "Import from Letterboxd" on `/onboarding` → `/import` opens with the steps, the file field and "Import ratings" → AC-15
- [x] Open `/home` as a finished user → the header shows an "Import" link that opens `/import` → AC-15
- [x] Upload the prepared file → the status line says "Importing" then "Imported 12 of 15 ratings"; three tiles show Rows read 15, Matched 12, Not matched 3 → AC-1, AC-2
- [x] Read the "Rows we left out" list → the three bad rows show "Not in our catalog" and "We could not read this row" → AC-2, AC-4
- [x] Reload `/import` → the same result shows again → AC-2
- [x] Press "See your feed" → `/home` opens (the user finished onboarding with 12 ratings) and none of the 12 imported titles appears as a card title → AC-1, AC-8
- [x] As a new user, import a file that matches only 4 films → the action reads "Keep swiping" and goes to `/onboarding` → AC-8
- [ ] Upload a zip file → alert "That's the zip file", focus is on the alert, "Try again" puts focus back on the file field → AC-3, AC-14
- [x] Press "Import ratings" with no file → alert "Choose your ratings.csv file first." → AC-3
- [x] Upload a header only file, a file with columns Foo and Bar, and a file over 2 MB → "That file has no ratings", "We could not read that file", "That file is too big"; no row is added to the Imports list → AC-3
- [x] Import 5 times in one day, then a sixth → "That's all the imports for today" with a reset time in local time → AC-9
- [x] Import a file with 130 unmatched rows → 50 rows show, "Load more rows" adds 50, then 30, then "That's every row." → AC-11
- [x] Use only the keyboard on `/import` (Tab to the file field, choose a file, Enter on the button) → every control has a visible focus ring and the result is announced → AC-14
- [x] Open `/design` → the "Letterboxd import" section shows the file field, the count tiles, the form in every state and the four result variants → design rule 6

## Commands
- [x] `pnpm typecheck && pnpm check` → clean → all
- [ ] `pnpm test` → all green, including the completeness test that now needs `imports` seeded in `delete-account.test.ts` → AC-13
- [x] `pnpm exec playwright test e2e/design.spec.ts` → axe WCAG A and AA scan of `/design` passes with the new section → AC-14
- [ ] `curl -i -X POST http://localhost:3000/api/import/letterboxd` with no cookie → `401 {"ok":false,"error":"unauthenticated"}` → AC-12
- [x] The same POST with a valid session cookie and `-H 'Origin: http://evil.test'` → `403 bad_origin`; with no `Origin` header → `403 bad_origin` → AC-12
- [x] In the database: `select status, rows_total, rows_matched, rows_unmatched from imports where user_id = '<id>'` after a good import → one `completed` row whose counts add up → AC-2
- [x] In the database, after a rating by swipe and then an import of the same film → the rating has `source = 'import'`, the new score, and the original `rated_at`; the `swipe_skips` row for it is gone → AC-5, AC-6
- [x] In the database, a rating with `source = 'manual'` stays unchanged after an import of the same film, and the row shows `kept_manual` in `import_unmatched_rows` → AC-5
- [x] Import 6 times as one user, then `select count(*) from imports where user_id = '<id>'` → at most 5 → AC-10
- [x] Time a 18,000 row file (about 1.7 MB) against the dev branch → finishes in well under 45 seconds (measured about 11 seconds from a laptop) → AC-16
- [x] Run the server with the log visible during an import → the log holds one line with counts, duration and an outcome, and no title, score or movie id → AC-13
- [x] Export a user's data (`exportUserData`) → `imports` carries each import with `unmatched` rows and `stars` equal to the score divided by 2, newest first → AC-13
- [x] Delete the account → no `imports` or `import_unmatched_rows` rows remain for the user → AC-13

## Value sourcing coverage
- [x] Row `Rating` 0.5, 3.5, 5 become scores 1, 7, 10; 0, 5.5, 3.3 and blank become `invalid_row` → AC-4 (score)
- [x] Row `Date` 2024-03-02 becomes `rated_at` 2024-03-02 00:00 UTC on a new rating; a date in the future, a bad date and a missing date use the database now → AC-5 (rated_at)
- [x] The same film twice in one file → the first row is saved, the second shows "Repeated in your file"; for a hand rated film the first row shows `kept_manual` and the second "Repeated in your file" → AC-4, AC-5 (duplicate)
- [x] A title typed with an accent, or a year one off from the catalog, still matches → AC-4 (match)
- [x] `rows_total` counts every data row; `rows_matched` counts ratings written; `rows_unmatched` counts everything else including `kept_manual` → AC-2 (counts)
- [ ] Import twice at 23:59 and 00:01 UTC (or change the day in the database) → the daily count and the reset time follow the database UTC day → AC-9 (day, reset)
- [x] A user with 9 ratings imports 1 film → onboarded stays empty; a user with 9 ratings imports 2 films → onboarded is set → AC-8 (onboarding rule)
- [x] Page the not matched list of an older import, and with another user's import id → the older one pages; another user's id returns "That import is no longer saved" → AC-11, AC-12 (ownership)
- [ ] Sign in from a preview host, and from `localhost:3000` → the import works from both (their origins are in the trusted list) → AC-12 (origin)

## Acceptance-criteria coverage
- AC-1 covered by the first import steps and the feed step · AC-2 by the tiles, the list and the reload · AC-3 by the rejected file steps · AC-4 by the row rules and duplicate steps · AC-5 by the swipe, manual and date steps · AC-6 by the skip step · AC-7 by the rollback check (`/test`: force an error mid save, expect one `failed` row and no ratings) · AC-8 by the onboarding steps · AC-9 by the limit steps · AC-10 by the keep 5 step · AC-11 by the Load more steps · AC-12 by the 401, 403 and ownership steps · AC-13 by the log, export and delete steps · AC-14 by the keyboard step and the axe run · AC-15 by the two entry link steps · AC-16 by the timing step · AC-17 by `/test` (an import and a parallel "not seen" swipe on the same film, never both rated and skipped)

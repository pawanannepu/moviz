# 0009. Letterboxd CSV import: one upload at `/import`, matched in memory, saved in one transaction

**Date**: 2026-11-11
**Status**: In Progress

## Summary

A signed in user uploads the `ratings.csv` file from their Letterboxd export on a new page, `/import`. Moviz reads the file in memory, matches each film to its catalog, and saves every match as a rating in one all or nothing step. The page then shows how many rows matched and lists the ones that did not, with a plain reason for each. Because the taste profile is computed on read, the feed changes on the next visit with no extra work. Most of the design was already settled in specs 0001 to 0003, so this spec adds the product rules, the failure rules, the endpoint and the page.

## Requirements

Seeded from scope feature 11 ("Letterboxd CSV import"). Its done line is: a user can upload a Letterboxd export, sees how many rows matched and which did not, the matched ratings change their feed, and a bad or empty file gives a clear error.

**User stories**:
- As a film fan with years of Letterboxd ratings, I want to upload my export so that my feed starts from my real taste and I skip the swipe deck.
- As a film fan, I want to see which films did not match, and why, so that I trust the import and know what was left out.
- As a film fan who already swiped some movies, I want my real star ratings to replace my quick swipes so that the feed reflects what I actually think.

**Acceptance criteria** (the contract; each is independently checkable):
- **AC-1**: A signed in user uploads `ratings.csv` on `/import`. Each row that matches a catalog movie becomes a rating with source `import` and a score of the Letterboxd stars times 2. The next feed visit uses those ratings with no other step.
- **AC-2**: The page shows the latest import: rows read, rows matched, rows not matched, and each not matched row with its title, year and a plain reason. The three counts add up (`matched + not matched = rows read`). The result is saved, so a refresh or a later visit shows it again.
- **AC-3**: A rejected file shows a clear error and saves no import record and no rating. Rejected means: no file sent, larger than 2 MB, a zip file, not readable as a CSV, a header without `Name`, `Year` and `Rating`, or no data rows.
- **AC-4**: Row rules. A star value of 0.5 to 5 in steps of 0.5 is valid; anything else, a blank title, or a missing or non numeric year is reason `invalid_row`. A valid row goes to `matchMovies`: `no_match` and `ambiguous` map to the reasons of the same name. If two rows match the same movie, the first row wins and the later ones get reason `duplicate`.
- **AC-5**: Existing ratings. An import row replaces the score of a rating whose source is `swipe` or `import` and sets its source to `import`; the original `rated_at` is kept and `updated_at` is `now()`. A rating whose source is `manual` is never changed, and the row is reported with reason `kept_manual`. A new rating takes `rated_at` from the CSV `Date` column (a valid past or current date), or `now()` when the date is missing, invalid or in the future.
- **AC-6**: Saving a rating by import removes that movie from the user's skips in the same transaction. (The watchlist step joins when feature 13 adds the table.)
- **AC-7**: The save is all or nothing. If the save transaction fails and rolls back (connection error, time budget, statement timeout, or a database error), no rating is saved, one `failed` import record is stored (`rows_total` as parsed, the other counts 0), and the user sees a retry message with the 503 status. No other error writes a `failed` record (see *Which errors write a record*).
- **AC-8**: In the same transaction as a successful save, the profile is marked onboarded when the user then has 10 or more ratings (the `MIN_RATED` rule from spec 0006). The result's action follows `profiles.onboarded_at` after the save: "See your feed" when it is set, "Keep swiping" when it is not. A missing profile row never fails the import.
- **AC-9**: A user may start at most 5 saved imports per UTC day (completed or failed; rejected files do not count). The sixth is refused with `daily_limit` and the time the limit resets. Parallel requests cannot push the count past 5.
- **AC-10**: A user keeps at most their latest 5 imports. When a save commits, and when a `failed` record is stored, older imports and their unmatched rows are deleted in the same transaction or statement.
- **AC-11**: The not matched list shows 50 rows, then a Load more button fetches the next 50 by an opaque cursor, never skipping or repeating a row. The action returns only rows of an import that belongs to the signed in user. Any import the user owns can be paged, not only the latest.
- **AC-12**: A signed out request gets 401. A POST whose `Origin` header is missing, or is not one of the app's trusted origins, gets 403. The user id always comes from the live session, never from the request. User A cannot read, page through or find user B's import.
- **AC-13**: No title, score, year, movie id or file content appears in a log line, error body or thrown message; only counts, durations and error codes do. The uploaded file is never stored. Export includes each import with its unmatched rows, and deleting the account removes them.
- **AC-14**: The page meets WCAG AA: a labelled file field, keyboard use only, a visible focus ring, an announced working status, errors in an alert with focus moved to it, no meaning carried by colour alone, 44px targets.
- **AC-15**: `/import` is reachable by a user who has not finished onboarding. The feed header and the onboarding page each link to it.
- **AC-16**: A file of about 20,000 rows (near the 2 MB cap) finishes inside the 60 second limit. Matching uses a fixed number of queries whatever the row count (measured with a query counting wrapper on `db` in the test), and writes go in chunks of 1000.
- **AC-17**: An import never leaves a movie both rated and skipped, even when the user swipes the same movie while the import runs.

## Decision

**Chosen option**: Option 1: One Route Handler that parses, matches and saves in a single request, with the result stored and shown on the page.

`POST /api/import/letterboxd` reads the file in memory, parses it with `csv-parse`, matches with `matchMovies`, and calls `saveImportResult`, which does the whole save in one transaction. The `/import` page is a Server Component that reads the latest saved import; one small client component posts the file.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.claude/skills/nextjs-app-router-patterns/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.claude/skills/drizzle-orm-patterns/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `typescript-advanced-types` (`wshobson/agents`, `.claude/skills/typescript-advanced-types/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.claude/skills/playwright-best-practices/`)

## Rationale

Reasoning, options, and the full decision log: see [rationale.md](rationale.md).

## Feature design

**Settled by earlier specs** (not reopened here): Route Handler only, `ratings.csv` only (not the zip), 2 MB cap, `maxDuration = 60`, parsed in memory and discarded, one transaction in chunks of 1000 (spec [0001](../0001-stack-architecture/index.md)); stars times 2, first duplicate wins, `rated_at` from the CSV `Date`, tables `imports` and `import_unmatched_rows` (spec [0002](../0002-data-model/index.md)); `matchMovies` with a one year tolerance and no guessing (spec [0003](../0003-movie-catalog/index.md)).

**Data model sketch** (migration 2, lands with this feature)

| Table | Key | Columns (required unless marked null) | Links and rules |
|---|---|---|---|
| `imports` | `id` bigint identity | `user_id` text; `status` enum (`completed`, `failed`); `rows_total` integer; `rows_matched` integer; `rows_unmatched` integer; `created_at` timestamptz default `now()`; `completed_at` (null, set when completed) | `user_id` to `user.id` ON DELETE CASCADE. Check: `status <> 'completed' OR rows_matched + rows_unmatched = rows_total`. Index (`user_id`, `created_at` desc, `id` desc). Unchanged from spec 0002. |
| `import_unmatched_rows` | (`import_id`, `row_number`) | `row_number` integer (the data row's position, first data row is 1); `title` text (cut to 200 characters); `year` smallint (null); `score` smallint (null, stars times 2); `reason` enum (`no_match`, `ambiguous`, `invalid_row`, `duplicate`, `kept_manual`) | `import_id` to `imports.id` ON DELETE CASCADE. **Change from spec 0002:** the enum gains `kept_manual`. It is created with the table in this migration, so no enum value is added later. A blank title (an `invalid_row`) is stored as an empty string, because the column is required. |

Relationships: a user has up to 5 kept `imports` (1:N), and each import has many `import_unmatched_rows` (1:N). No change to `ratings` or `profiles`: imported ratings use the existing source `import`. The table `imports` has a `user_id` column, so `src/user-data/user-tables.ts` gains `imports: "imports"`, and `exportUserData` and `deleteAccount` extend in the same change (the child table reaches the user through its parent).

Migration details: the enums are named `import_status` and `import_unmatched_reason`. Checks: `rows_total`, `rows_matched` and `rows_unmatched` are at least 0; `row_number` is at least 1; an unmatched `score`, when set, is between 1 and 10.

**Export**: `exportUserData` gains `imports`, newest first (`created_at` desc, `id` desc), each with its `unmatched` rows ordered by `row_number`. Each unmatched row exports `{ rowNumber, title, year, stars, reason }` with `stars = score / 2` (null stays null), to match spec 0002's `UserExport` shape. Five imports of 20,000 rows can approach Vercel's body limit, so the export route streams, as spec 0002 already says.

**State transitions**: an `imports` row is written once, as `completed` inside the save transaction, or as `failed` in a separate statement after that transaction rolled back. It never changes afterwards, except by deletion (pruning, account delete).

**Code layout** (folder by feature)

- `src/import/` (new): `parse-letterboxd.ts` (pure: bytes to rows or a file level error), `row-rules.ts` (pure: star, year, title and date rules), `plan-import.ts` (pure: applies the matcher answers, duplicate rule and counts), `save-import-result.ts` (the transaction), `get-latest-import.ts`, `list-unmatched.ts`, `run-import.ts` (parse, match, save: the body of the route), `actions.ts` (the Load more Server Action), `messages.ts` (user text for each error and reason), `import-form.tsx` (client), `import-result.tsx`, `unmatched-list.tsx` (client, Load more).
- `src/app/api/import/letterboxd/route.ts`: thin; wires `db`, the session reader and the origin check into `runImport`.
- `src/app/(protected)/import/page.tsx`, `error.tsx`: thin page, guards, header.
- The unmatched list reuses `src/ui/load-more-bar.tsx`. New pieces (file field, count tiles, reason badges) are added to `src/ui/` and to the `/design` page in every state, as `design.md` requires.

**API surface**

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/import/letterboxd` | POST | `multipart/form-data` with one field `file` (required); `Origin` header | `200 { ok: true, importId, rowsTotal, rowsMatched, rowsUnmatched, onboarded }` | Live session | `401 unauthenticated`; `403 bad_origin`; `400 no_file`; `413 file_too_large`; `422 looks_like_zip`, `not_letterboxd_ratings`, `empty_file`; `429 daily_limit` (with `resetAt`, an ISO 8601 UTC time the page shows in local time); `503 db_unavailable` |
| `loadMoreUnmatchedAction` (Server Action) | n/a | `importId` (positive int), `after` (opaque cursor or null), validated with Zod | `{ rows: [{ rowNumber, title, year, reason }], nextCursor }` | Live session via `getUserForAction()` | `unauthenticated`, `invalid_input`, `invalid_cursor`, `not_found` (also when an import was pruned while paging), `db_unavailable` |
| `/import` | GET (page) | none | Page with the form and the latest import of any status (counts, first 50 unmatched rows, `nextCursor`) | Session via `requireUser("/import")`; the proxy already closes it to signed out visitors | redirect to sign in; page level `error.tsx` |

Every error body is `{ ok: false, error: <code> }` and nothing else (plus `resetAt` for `daily_limit`). The route and the action return typed results mapped to a message at the edge, as in specs 0005 to 0008.

**The request, in order** (`runImport`)

1. Read the session (`getUserForAction`); 401 if none. Check `Origin` for an exact match with the app's trusted origins (`trustedOrigins()`, which this feature exports from `src/auth/auth.ts`; it covers the configured URL, the Vercel preview hosts and localhost outside production); 403 if it is missing or different. Do both before reading the body. Read one `now` here and pass it to the pure rules.
2. Reject early when `Content-Length` is over 2 MB plus 16 KB of form overhead (`file_too_large`). Then read the form; no `file` field, or not a file, is `no_file`; `file.size` over 2,097,152 bytes is `file_too_large`.
3. Cheap pre check of the daily cap (a `count` on `imports` for today's UTC day). At 5 or more, return `daily_limit` before parsing. (Re checked under a lock in step 7.)
4. Read the bytes. If they start with `PK\x03\x04`, return `looks_like_zip`. Decode as UTF-8 (a BOM is removed; invalid bytes make it `not_letterboxd_ratings`).
5. Parse with `csv-parse/sync`: `columns` (header names trimmed, matched case insensitively), `skip_empty_lines`, `bom`, strict quotes, `relax_column_count: true` (a ragged row becomes `invalid_row`, not a rejected file). A parse error, or a header missing `Name`, `Year` or `Rating`, is `not_letterboxd_ratings`. Zero data rows is `empty_file`.
6. Plan: apply the row rules, send the valid `{ title, year }` pairs to `matchMovies` once, then apply the duplicate rule. Output: the movies to save (`{ movieId, score, ratedAt }`) and the unmatched rows with reasons, in file order.
7. `saveImportResult` (one transaction that starts with `SET LOCAL statement_timeout = '20s'` and checks a 45 second budget before each chunk, rolling back when it is passed): take the exclusive per user import lock; re check the daily cap and, if reached, finish with the typed value `daily_limit` and commit nothing; read which planned movies the user already rated with source `manual`; move those rows to unmatched with `kept_manual`; compute the final counts; insert the `imports` row (`completed`, `completed_at = now()`); upsert ratings in chunks of 1000, with `WHERE ratings.source <> 'manual'` on the conflict update, and after each chunk delete the matching `swipe_skips`; check that the rows written equal the planned rows minus the kept ones (roll back if not); insert the unmatched rows in chunks of 1000; prune imports beyond the latest 5; when the user's rating count is 10 or more, run `UPDATE profiles SET onboarded_at = coalesce(onboarded_at, now())` (zero rows updated is fine and never an error). `rated_at` for a row without a usable date is the database `now()`, not a JavaScript date.
8. Errors map by where they happen (table below). Only a rollback of the save writes a `failed` row, in a separate statement that also prunes to the latest 5 in the same statement, best effort.
9. Return the counts and `onboarded` (read from the profile after the save). The client then calls `router.refresh()` so the page shows the saved result.

**Which errors write a record**

| Where | Error | Code returned | Writes `failed`? |
|---|---|---|---|
| Session, origin, body, file, parse and empty checks | any rejection | its own code (see the API table) | No |
| Daily cap, in the pre check or the locked re check | cap reached | `daily_limit` | No |
| `matchMovies` | connection failure | `db_unavailable` | No (nothing was saved) |
| Save transaction | user row gone (`user_not_found`, or the user key error) | `unauthenticated` | No |
| Save transaction | connection error, time budget, statement timeout, row count check, movie key error | `db_unavailable` | Yes |

**Row rules** (pure, in `row-rules.ts`)

- Header names are matched after trim and lower casing: `name`, `year`, `rating`, `date`. `Letterboxd URI` and any other column are ignored. `Date` is optional.
- Stars: the text must match `^[0-5](\.[05])?$` and be at least 0.5; score = stars times 2 (1 to 10). Anything else, including blank, is `invalid_row` with `score` stored as null.
- Title: trimmed; blank is `invalid_row`. Stored cut to 200 characters. The full trimmed title goes to the matcher.
- Year: four digits, 1870 to the current UTC year plus 5; anything else is `invalid_row` with `year` stored as null.
- Date: `YYYY-MM-DD`, a real calendar day, not after today's UTC date (taken from the one `now` the route passes in); used as `rated_at` at 00:00:00 UTC. Otherwise `rated_at` is the database `now()`.
- Order of rules: the duplicate rule runs in the plan, before the manual check. If a movie that the user rated by hand appears twice in the file, the first row gets `kept_manual` and the later ones stay `duplicate`.

**Messages** (sentence case, plain verbs, no apology, per `design.md` Voice; exact wording is for the build, within these meanings)

| Code | Meaning shown to the user |
|---|---|
| `no_file` | Choose your ratings.csv file first. |
| `file_too_large` | That file is over 2 MB. Upload ratings.csv from your export, not the whole export. |
| `looks_like_zip` | That is the zip file. Unzip it and upload ratings.csv from inside. |
| `not_letterboxd_ratings` | We could not read that as a Letterboxd ratings file. It needs the columns Name, Year and Rating. |
| `empty_file` | That file has no ratings in it. |
| `daily_limit` | You have used today's 5 imports. Try again after {reset time}. |
| `db_unavailable` | The import did not save, and none of your ratings changed. Try again in a moment. |
| `unauthenticated` | Your session ended. Sign in again, then upload the file. |
| `bad_origin` | The upload was blocked. Reload the page and try again. |
| reason `no_match` | Not in our catalog |
| reason `ambiguous` | More than one film fits |
| reason `invalid_row` | We could not read this row |
| reason `duplicate` | Repeated in your file |
| reason `kept_manual` | You rated this by hand, so we kept your rating |
| `not_found` (Load more) | That import is no longer saved. Reload the page. |
| `invalid_cursor`, `invalid_input` (Load more) | We could not load more rows. Reload the page and try again. |

Replies that are not our JSON (Vercel's own 413 for a body over 4.5 MB, a 504 at the time limit, or a network failure) are mapped in the client to the `file_too_large` and `db_unavailable` texts. `resetAt` is shown in the user's local time.

**Page** (built to `design.md` and the existing `src/ui` pieces; no design tool needed)

Top to bottom: a title and one line promise; a three step guide to getting `ratings.csv` out of Letterboxd; the file field and an Import button; then the latest import of any status. The result shows three count tiles (rows read, matched, not matched), or, when the latest import is `failed`, only the retry text (`db_unavailable`). It also shows a primary action ("See your feed" to `/home` when `profiles.onboarded_at` is set, otherwise "Keep swiping" to `/onboarding`; the page reads it with `getProfile`), and the not matched list (50 rows, then Load more). With no import yet, only the form shows. States to build and show on `/design`: idle, file chosen, working (up to 60 seconds, button `aria-disabled`, focus stays on it, status announced), success (announces "Imported {matched} of {total} ratings"), each rejected file error, daily limit, and a failed save. Errors render in an `ErrorState` with `role="alert"` and focus moves to it. The page works only with JavaScript, like the feed, and a `noscript` line says so.

**Value sourcing**

| Action | Value produced or displayed | Source |
|---|---|---|
| Parse | the file's rows | `csv-parse` over the decoded bytes of the `file` field |
| Row rules | `score` | `stars * 2`, stars from the `Rating` column (spec 0002) |
| Row rules | `rated_at` for a new rating | the `Date` column as 00:00:00 UTC; `now()` when missing, invalid or in the future |
| Match | the movie for a row | `matchMovies(title, year)` (spec 0003); `no_match` and `ambiguous` map to the same reasons |
| Plan | `duplicate` | the same `movieId` already planned from an earlier row |
| Save | `rating.source` | the literal `import` |
| Save | `updated_at` | database `now()` |
| Save | which existing ratings are kept | `ratings.source = 'manual'` for the user and the planned movie ids, read inside the transaction under the locks |
| Save | `rows_total`, `rows_matched`, `rows_unmatched` | `rows_total` = data rows parsed; `rows_matched` = ratings written; `rows_unmatched` = every other row, including `kept_manual`. Computed inside `saveImportResult`, not by the route (this replaces spec 0002's "counted by the Route Handler" line, because `kept_manual` is only known under the locks) |
| Save | `completed_at` | `now()` on commit; null for `failed` |
| Save | `import_unmatched_rows.row_number` | the row's 1 based position among data rows |
| Save | the 5 import keep rule | the latest 5 by (`created_at`, `id`) descending for the user |
| Daily cap | the UTC day and the reset time | `(now() at time zone 'utc')::date` in SQL; reset is the next UTC midnight, sent as an ISO 8601 UTC string |
| Pure row rules | "today" for the `Date` and year checks | one `now` read in `run-import` and passed in; the rules never read the clock |
| Export | `stars` for an unmatched row | `score / 2`, null when `score` is null |
| Onboarding | whether to mark onboarded | the user's rating count after the upserts, at least `MIN_RATED` (10, `src/onboarding/deck-rules.ts`) |
| Result block | `onboarded` | `profiles.onboarded_at` is not null, read after the save |
| Load more | page of unmatched rows | `import_unmatched_rows` for an import joined to `imports.user_id = session user`, ordered by `row_number`, 50 per page, cursor = base64url of `{ r: <last row_number> }` from a small codec in `src/import/` (the helper in `src/db/cursor.ts` is timestamp only); Zod checks `r` as a positive integer |
| Origin check | the allowed origins | `trustedOrigins()` exported from `src/auth/auth.ts` (the list Better Auth already uses) |
| Messages | user text | `src/import/messages.ts`, keyed by code |

**Key invariants**

- `matched + unmatched = total` for a `completed` import (database check), and every parsed data row is either a rating written or one unmatched row.
- One rating per (user, movie): a movie appears in the planned list at most once.
- A movie is never both rated and skipped (the per user lock, AC-17). The watchlist rule joins with feature 13.
- A `manual` rating is never changed by an import.
- A rejected file leaves no trace in the database. A failed save leaves exactly one `failed` row and no rating.
- A user has at most 5 imports in the table, and at most 5 started on one UTC day.
- Pure helpers (`parse-letterboxd`, `row-rules`, `plan-import`) have no database or clock access; the clock and the database stay in `save-import-result.ts` and `run-import.ts`.

**Security model**

- Personal data here is the user's ratings and the titles in their file. The scope names no legal regime (spec 17 decides). Ratings content never goes to logs, errors or analytics.
- Authentication: the live session on every request (the proxy only checks the cookie). Authorization: the user id comes from the session; `import_unmatched_rows` is always read through `imports.user_id`.
- CSRF: the session cookie is SameSite Lax, which already blocks a cross site POST. The `Origin` check is a second guard.
- The file is untrusted. It is size capped twice, zip detected, strictly parsed, never stored, and never evaluated. Titles are shown as text (React escapes them) and are not exported as a spreadsheet, so there is no formula injection path.
- Cost abuse is bounded by the 2 MB cap, the 60 second limit, the 5 per day cap, and the per user lock that serializes a user's imports.

**Locking and concurrency**

- One key, `hashtextextended('import:' || userId, 0)`, is held in two modes. Two helpers join `src/db/advisory-lock.ts`: `lockUserImport(tx, userId)` (exclusive, `pg_advisory_xact_lock`) and `lockUserImportShared(tx, userId)` (`pg_advisory_xact_lock_shared`).
- The import takes the exclusive lock first. That makes a user's imports run one at a time, so the daily cap cannot be beaten by parallel requests, and it waits for the user's own swipes already in flight.
- `saveRating`, `saveSwipe` and `undoSwipe` take the shared lock before their existing per (user, movie) lock. While an import runs, only that user's own rating writes wait; other users are not affected. Swipes by one user do not block each other, because shared locks are compatible.
- The order is always import lock (shared or exclusive) then per movie lock, and an import takes no per movie lock, so no cycle can form. This is one lock per import, so it adds no pressure on Postgres's shared lock table.
- The transaction starts with `SET LOCAL statement_timeout = '20s'`, which caps any one statement, and checks a 45 second budget before each chunk, which caps the whole save. Either one rolls back, so the lock is released and the `failed` record is written before Vercel stops the function at 60 seconds.
- The save is a few big statements, not a loop of single saves.

**Configuration required**

- No new environment variables. The package `csv-parse` is added with `pnpm add csv-parse` (pin the exact version at install).
- Named constants in `src/import/constants.ts`: `MAX_FILE_BYTES` (2,097,152), `MAX_IMPORTS_PER_DAY` (5), `KEEP_IMPORTS` (5), `CHUNK_SIZE` (1000), `UNMATCHED_PAGE_SIZE` (50), `TITLE_MAX_CHARS` (200).

**Critical test scenarios** (written afterwards by `/test`; database cases run on the Neon test branch)

- Happy path: upload a file with matching rows (including a half star, an accented title and a one year off row); ratings exist with source `import`, scores are stars times 2, the page shows matching counts, verifies **AC-1**, **AC-2**
- Happy path: after the import the feed's first batch differs from before (a rated movie is gone and a reason names an imported liked movie), verifies **AC-1**
- Happy path: a new user imports 12 matches and is onboarded; one with 4 matches is not and sees Keep swiping, verifies **AC-8**
- Happy path: swipe ratings are replaced and keep their `rated_at`; the swiped movie's skip is gone, verifies **AC-5**, **AC-6**
- Happy path: 130 unmatched rows paginate 50, 50, 30 with no repeat, verifies **AC-11**
- Happy path: more than 5 imports kept: the sixth import prunes the oldest and its unmatched rows, verifies **AC-10**
- Failure case: each rejected file (empty, header only, 2 MB plus 1 byte, a zip, a PDF renamed, missing `Rating` column, no file) returns its code and writes nothing, verifies **AC-3**
- Failure case: invalid stars (0, 5.5, 3.3, blank), blank title, bad year, a duplicate movie, an `ambiguous` pair and a `no_match` row land as the right reasons and the counts add up, verifies **AC-4**, **AC-2**
- Failure case: a `manual` rating survives an import and the row shows `kept_manual`, verifies **AC-5**
- Failure case: a forced error mid transaction rolls back every rating and stores one `failed` row, verifies **AC-7**
- Failure case: 3 parallel imports by one user at 4 saved today; exactly one succeeds, verifies **AC-9**
- Failure case: an import and a parallel "not seen" swipe on the same movie, many times; never both rated and skipped, verifies **AC-17**
- Failure case: a 20,000 row file finishes within 60 seconds and the matcher query count does not grow with rows, verifies **AC-16**
- Auth/permission: no cookie gets 401; a wrong `Origin` gets 403; user A passes user B's `importId` to Load more and gets `not_found`, verifies **AC-12**
- Privacy: log output and error bodies for the cases above contain no title, score or movie id, verifies **AC-13**
- Completeness: export carries `imports` with `unmatched`; `deleteAccount` leaves no `imports` or unmatched rows; the user tables completeness test passes, verifies **AC-13**
- Accessibility: axe on `/import` in idle, error and result states; keyboard only upload; the status is announced and focus lands on the alert, verifies **AC-14**
- Navigation: the feed header and the onboarding page link to `/import`; an unfinished user can open it, verifies **AC-15**

## Build plan

Build approach: Tracer Bullet (from `AGENTS.md`). The thin thread runs from a tiny CSV, through the route, the matcher and the transaction, to a visible count on `/import`. Later tasks thicken it: every row rule, the lock and cap rules, the not matched list, the page states and the links. One migration covers the feature. Tests are written by `/test` after the build (Beta workflow).

Built by `/develop letterboxd csv import`:

1. [x] Prerequisites: `pnpm add csv-parse`; add `src/import/constants.ts` (including the 45 second budget and the 20 second statement timeout); export `trustedOrigins()` from `src/auth/auth.ts`; confirm which Neon branch `.env.local` points at before any migration. Satisfies **AC-3**, **AC-12**
2. [x] Migration 2: schema for `imports`, `import_unmatched_rows`, the two enums (including `kept_manual`), the check and the index; `pnpm db:generate`, review the SQL, apply to dev. Satisfies **AC-2**, **AC-7**, **AC-10**
3. [x] Pure core: `parse-letterboxd.ts`, `row-rules.ts`, `plan-import.ts`, `messages.ts`. Satisfies **AC-3**, **AC-4**, **AC-5**
4. [x] Thin thread: `save-import-result.ts` with the import lock, the manual check, the imports row, rating upserts in chunks, skip deletes and the unmatched insert; `run-import.ts` and the route; a bare `/import` page with a file field and the counts. Satisfies **AC-1**, **AC-2**, **AC-5**, **AC-6**
5. [x] Safety rules: session and `Origin` checks, early size checks, zip detection, the daily cap (pre check and locked re check), the `failed` record with its error table, the statement timeout and time budget, and the per user lock: `lockUserImport` and `lockUserImportShared` in `src/db/advisory-lock.ts`, with the shared lock added to `saveRating`, `saveSwipe` and `undoSwipe` (update their tests). Satisfies **AC-3**, **AC-7**, **AC-9**, **AC-12**, **AC-17**
6. [x] Onboarding and pruning inside the transaction: the rating count rule and the keep 5 delete. Satisfies **AC-8**, **AC-10**
7. [x] Export, delete and the completeness list: `imports` in `user-tables.ts`, `exportUserData` with `unmatched`, `deleteAccount`. Satisfies **AC-13**
8. [x] Not matched list: `list-unmatched.ts` with the row number cursor, `loadMoreUnmatchedAction`, `UnmatchedList` on `LoadMoreBar`. Satisfies **AC-11**, **AC-12**
9. [x] Page and design: the full `/import` page and states built to `design.md`, new `src/ui` pieces added to `/design` in every state, announcements and focus rules, `noscript` line, `error.tsx`. Satisfies **AC-2**, **AC-14**
10. [x] Entry points: an Import link in `FeedHeader` and a text link on the onboarding page. Satisfies **AC-15**
11. [x] Logging and limits check: counts only logs; a 20,000 row sample file run against the dev branch for timing, and a test that counts queries through a wrapper on `db` for 100 rows and for 5,000 rows. Satisfies **AC-13**, **AC-16**

Traceability: every AC appears in at least one task, and each task names its ACs.

## Consequences

**Positive**:
- A new user can reach a full feed in one upload, and the feed needs no change because taste is computed on read.
- The all or nothing save and the per user lock make a half imported state and a double import impossible.
- Rejected files cost nothing to store, and the result of a good import survives a refresh.
- Each failure has a plain message and a stable code, so tests and support can name it.

**Negative / tradeoffs**:
- The catalog holds about 3,000 films, so a large Letterboxd history will mostly come back as "Not in our catalog". The import is honest about it, but a first impression of 15 percent matched may feel poor.
- The whole import runs in one request, up to 60 seconds, with a spinner and no progress bar. A very slow database could hit the limit and show a retry message.
- Every rating write now takes one extra shared lock, a small cost on a hot path, and a user's own swipes wait while their import runs (at most about 45 seconds).
- An import replaces swipe ratings, so a user's quick swipes can be lost. There is no undo (kept out of scope).
- The per day cap counts failed saves, so a flaky database can use up a user's imports.
- Importing an unfinished user with 10 or more ratings skips the swipe deck for good, even if their imported taste is narrow.
- Watchlist cleanup is missing until feature 13 adds the table, so it must update `saveImportResult` then.

**Neutral**:
- Spec 0002 and spec 0003 hold lines this spec changes or resolves (see Follow-up). Their follow up items are not edited here.
- The `/import` page needs JavaScript, like the feed.
- A user can re upload the same file safely; it re saves the same scores and uses one of the day's 5 imports.

## Follow-up

- [ ] Spec 0002 (stale after this spec): the `import_unmatched_rows.reason` enum gains `kept_manual`; the counts are computed inside `saveImportResult`, not by the Route Handler; a rejected file saves no `failed` record (only a failed save does); and "how many past imports a user keeps" is settled at 5.
- [ ] Spec 0002 locking section: add the shared and exclusive per user import lock, and say that every future write to ratings, skips or the watchlist (feature 13 and later) takes `lockUserImportShared` before its per movie lock.
- [ ] Spec 0003: the follow up item "Spec 11 (Letterboxd import)" is done by this spec.
- [ ] Verify at build: `csv-parse` current version and its `bom`, `relax_column_count` and `skip_empty_lines` options; that the shared and exclusive advisory locks work through Neon's transaction pooler (they are `xact` scoped, so they should) and that `SET LOCAL statement_timeout` takes effect inside a Drizzle transaction; how `request.formData()` behaves with a file near the cap in a Next.js 16 Route Handler (read the Route Handler guide in `node_modules/next/dist/docs/` first); Vercel's body limit (4.5 MB).
- [ ] Verify the exact wording of Letterboxd's export steps (Settings, then the data export) before launch, because their menu may change.
- [ ] Feature 13 (watchlist and seen): add the watchlist delete to `saveImportResult` and extend this feature's tests.
- [ ] Feature 17 (privacy): list the uploaded file as data held in memory only; decide whether imports need an audit record.
- [ ] Out of scope, named so they are not lost: download the unmatched rows as a CSV, undo an import, accept the full export zip, import `watched.csv` and `watchlist.csv`, a progress bar for very large files.
- [ ] Declined: Agent Skills and MCP servers for `csv-parse` (no new tool context is needed).

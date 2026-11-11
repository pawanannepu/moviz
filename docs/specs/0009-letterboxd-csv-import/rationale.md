# 0009. Rationale: Letterboxd CSV import

This file is the decision record for [index.md](index.md). The build does not read it.

## Context

> ⚠️ Premise note: The catalog holds about 3,000 films, and a Letterboxd history often reaches into the thousands, including obscure titles. Many people will see most of their rows land as "Not in our catalog". The feature still meets its done line (matched ratings change the feed), but the first impression can feel poor if the page only celebrates the match count. The right framing is to report both numbers plainly, list the unmatched rows with a reason, and treat a bigger catalog as a separate decision, not a flaw in the import.

Moviz asks new users to bring their taste in, either by swiping through movies or by uploading what they already rated on Letterboxd. Swiping is built. The import is the faster path for someone with years of ratings, and the scope promises it from the landing page onward.

Earlier specs fixed the shape of the work. The stack spec says the import is a Route Handler that accepts `ratings.csv` only, capped at 2 MB and 60 seconds, parsed in memory and discarded. The data model spec designed the `imports` and `import_unmatched_rows` tables, the score rule (stars times 2) and the duplicate rule. The catalog spec built `matchMovies`, which turns a title and year into one movie and refuses to guess. What is left is the product behavior: where the page lives, how an import meets onboarding and existing ratings, what counts as a bad file, how often a user may import, and how a large result is shown.

The forces: a solo builder with no deadline, a free product with no billing, a 60 second function limit on Vercel, a 4.5 MB request body limit, a Neon database behind a transaction pooler, taste computed on every read, and a rule that ratings content never reaches logs. The cost of deciding badly is a feed that ignores the import, a half imported state after a crash, or a user who overwrites their own hand made ratings by accident.

## Options considered

### Option 1: One Route Handler that parses, matches and saves in a single request

The browser posts the file. The server parses it, matches all rows with `matchMovies`, and saves everything in one transaction, then the page shows the stored result.

**Pros**:
- Fewest moving parts: no queue, no storage, no polling. It follows the stack spec.
- All or nothing is easy: one transaction either commits or rolls back.
- The matcher already resolves thousands of rows in a fixed number of queries.

**Cons**:
- The user waits up to 60 seconds with a spinner and no progress.
- A very slow database could hit the function limit.

### Option 2: Store the file, then process it in a background job

The server saves the upload to storage, returns at once, and a queued job (or a cron) parses and saves it. The page polls for the result.

**Pros**:
- No request time limit, and a progress bar becomes possible.
- A failed job can be retried without the user.

**Cons**:
- Adds file storage, a queue or cron, a status state machine and polling, none of which the stack has.
- Stores the user's full ratings file, which raises privacy duties the project has not taken on.
- Much more to test, for a file that matches in seconds.

### Option 3: Parse in the browser and send ratings in batches through Server Actions

The browser reads the CSV, then sends rows to the server in groups.

**Pros**:
- Server requests are short, and a progress bar is natural.
- The server never receives the raw file.

**Cons**:
- Not atomic: a closed tab leaves a partial import, which breaks the all or nothing rule.
- Parsing and validation would exist in the browser, where it cannot be trusted, so the server must repeat it.
- Many small requests make the daily cap and the keep five rule hard to apply as one unit.

## Rationale

Option 1 fits every force above. Matching runs against a local catalog in a fixed number of queries, so a file near the 2 MB cap (about 20,000 rows) needs seconds, not minutes, and the 60 second limit leaves a wide margin. Option 2 adds storage, a queue and a state machine to solve a time problem the project does not have, and it would hold users' full rating files, which the privacy slice has not yet decided how to handle. Option 3 gives up the one property that makes an import safe to retry, atomicity. The stack spec already chose this shape, and nothing found while designing the details argued against it.

The engineer's answers set the product rules, and each has a reason tied to the forces:

- **A page of its own at `/import`, linked from the feed header and the onboarding page.** The landing page promises the import, returning users want it later, and onboarding is where new users decide how to start. A step inside onboarding only would shut returning users out.
- **Counts as onboarded at 10 or more ratings.** It reuses the rule from spec 0006 (`MIN_RATED`), so an importer with a real history skips the deck, and someone whose file matched only 3 films still gets swipe cards to top up. Always marking onboarded would give a thin feed; never marking would make a person with 500 ratings swipe first.
- **An import replaces swipe ratings and never manual ones.** A star rating from Letterboxd is a deliberate opinion, a swipe is a quick one. Manual ratings (feature 13) are a deliberate act inside Moviz, so the import leaves them and reports the row as `kept_manual`. Replacing everything would be simpler but could erase a hand made rating, and never replacing would ignore the user's real stars.
- **The result is saved and shown under the form, with the latest 5 imports kept.** Saving it makes a refresh safe and lets the page show the unmatched list later. Keeping 5 answers the open question left by spec 0002 and bounds how many unmatched rows a user can store. Keeping only 1 would hide the earlier result after a re upload; keeping all would need a history view for little gain.
- **Out of scope: unmatched CSV download, undo, the full zip.** Undo needs a new column on ratings and a way to restore overwritten swipe scores. The zip reverses a stack decision and adds zip bomb checks. The CSV download is small, but each extra endpoint adds tests, and the on page list already carries the information. All three are named in Follow-up.
- **A rejected file leaves no record; only a failed save does.** This differs from one line of spec 0002 (it kept a `failed` row with 0 total for a parse failure). A wrong upload is the user's mistake, not an import, and a record for it would push real imports out of the latest 5. The `failed` row remains for the case that matters, a save that rolled back.
- **5 imports per user per UTC day, checked in the database.** The endpoint is the most expensive one the app has (2 MB, up to 60 seconds). The cap comes from the `imports` table, so it needs no new table and no new service. Rejected files do not count, so a user who picks the wrong file is not punished.
- **A client component posts the file with `fetch`.** The request can run 60 seconds, and a plain form post would leave the user with a frozen page and no announced status. The `fetch` version gives a working state and inline errors, with the same trade as the feed (it needs JavaScript).
- **`csv-parse`.** Letterboxd titles contain commas, quotes and line breaks, so a hand written split is unsafe. `csv-parse` is mature, Node focused and strict about quotes, and its sync API is enough for a 2 MB file. Papaparse is built browser first and is more forgiving than this endpoint wants.
- **Unmatched rows: 50 then Load more.** A big file can leave about 20,000 unmatched rows. The data model spec already requires growing lists to use an opaque cursor, 50 a page, and the feed's Load more bar already exists.
- **Design source: the existing `design.md` and `src/ui`.** No new look is needed; new pieces are added to `/design` as the rules require.

Decisions I made without a question, with the runner up:

- **One per user lock, exclusive for the import and shared for every rating write.** This closes the one race left (a swipe "not seen" committing between the import's skip delete and its commit). My first draft took a per movie lock for every planned movie (up to about 3,000 in one transaction). The cross check pointed out that this can exhaust Postgres's shared lock table when two large imports overlap, and the resulting error would also use up a daily slot. The engineer chose the single lock. Only the importing user's own swipes wait, so the cost I first worried about (every swipe waits) does not apply to other users. Runner up: the per movie locks, rejected for the lock table risk.
- **A 45 second budget plus a 20 second statement timeout.** `statement_timeout` limits one statement, not the whole transaction, so the budget checked before each chunk is what keeps the save inside Vercel's 60 seconds. Without them, a killed function would leave Postgres holding the lock with no `failed` record and no response.
- **Errors write a `failed` record only when the save itself rolls back.** A cap refusal, a matcher failure or a deleted account would otherwise use up a daily slot for something that is not an import attempt. The table in the spec lists each case.
- **The origin check uses the trusted origins Better Auth already has,** exported from `src/auth/auth.ts`. A check against `BETTER_AUTH_URL` alone would refuse preview deployments and localhost.
- **The daily cap is checked twice:** a cheap count before parsing, and again under the user lock. The first saves work for an obvious refusal; the second is the one that is correct under parallel requests.
- **Counts are computed inside the transaction.** `kept_manual` is only known once the locks are held, so the route cannot know the final counts earlier.
- **Strict quotes but a relaxed column count.** A broken quote means the file is not what we expect, so it is rejected. One ragged row should cost one row (`invalid_row`), not the whole file.
- **Origin check on top of SameSite Lax.** Route Handlers have no built in CSRF guard the way Server Actions do. Lax already blocks a cross site POST; the check costs a few lines.
- **A year of 1870 to this year plus 5.** It rejects typos without blocking real films from the catalog's range.
- **Title cut to 200 characters when stored.** It bounds storage for a hostile file. The matcher still gets the full title.
- **Row number cursor, not the timestamp cursor of `src/db/cursor.ts`.** The unmatched rows are ordered by `row_number`, so the cursor is the number itself in base64. Reuse the page size constants from that file.
- **The result page uses `router.refresh()` after a success,** so the stored result is the one source of truth and a refresh looks the same as the first view.

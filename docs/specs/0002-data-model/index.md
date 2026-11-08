# 0002. Data model: narrow Postgres tables, designed whole, migrated per slice

**Date**: 2026-11-08
**Status**: In Progress

## Summary

Moviz keeps its data in plain Postgres tables, one table per meaning: ratings, watchlist, skips, feed feedback, imports. This spec designs every table the planned slices need now, so later slices only add to it and never reshape it. Each table is still created in the slice that first needs it. A user's data can be exported as one JSON file and deleted in one step, because every user table hangs off the user row.

## Requirements

Seeded from scope feature 3 ("Data model"). Its done when line is: entities and relationships support all planned slices without a breaking migration, and a user's data can be exported and deleted.

**User stories**:
- As a film fan, I want my ratings, watchlist, and feedback to be remembered so that my feed keeps getting better.
- As a film fan, I want to download my data and delete my account so that I stay in control of my personal data.
- As the builder, I want each later slice to add tables without reshaping existing ones so that I can ship one slice at a time.

**Acceptance criteria** (the contract; each is independently checkable):
- **AC-1**: Every planned slice (see *Slice coverage*) can be built with additive migrations only (new tables, new nullable columns, new enum values). The one table this spec does not design, streaming availability for feature 16, is named and left to spec 16.
- **AC-2**: A user has at most one rating per movie. The score is 1 to 10 (half stars), enforced by the database. Saving again overwrites the score and source and updates `updated_at`.
- **AC-3**: Saving a rating (by swipe, by hand, or by import) removes that movie from the user's watchlist and from their skips in the same transaction. Adding a rated movie to the watchlist is refused with `already_rated`. (Lands with feature 13.)
- **AC-4**: A swipe of liked or disliked saves a rating of 8 or 2 with source `swipe`. A swipe of not seen saves a skip row and no rating. Repeating the same swipe is harmless.
- **AC-5**: One shared exclusion filter hides every movie the user has rated, skipped, or marked not interested. The deck and the feed both use it.
- **AC-6**: A user has at most one feedback row per movie. Setting the other kind replaces it, and clearing removes it. (Lands with feature 14.)
- **AC-7**: Each embedding is stored with its model name and dimension, one per movie and model, and the dimension is 1024. A cosine nearest neighbour query returns the right movies. At the current catalog size it runs as an exact scan filtered by the user's exclusions; the HNSW index exists for later growth and must work when forced.
- **AC-8**: A full text query over movie title and overview returns ranked movies through the generated search column. Title matches rank above overview matches, and a movie with no overview is still found by title.
- **AC-9**: Looking up a normalized title plus year finds the movie, including through alternate titles. Catalog loading and import both build the key with the same `normalizeTitle` function.
- **AC-10**: An import result (counts, matched ratings, unmatched rows with reasons) is saved in one transaction and the counts add up. A failed import saves a `failed` record and no ratings. (Lands with feature 11.)
- **AC-11**: The 31st mood search by one user on one UTC day is refused, and concurrent searches cannot push the count past 30. (Lands with feature 15.)
- **AC-12**: Exporting a user's data returns one JSON document with the account, profile, ratings, watchlist, feedback, skips, and imports. It carries movie titles beside ids and never includes password hashes or session tokens. It follows the `UserExport` shape in *Feature design*, covers every user table including child tables, and contains only that user's data.
- **AC-13**: Deleting an account removes the user row and every user owned row in every table (by cascade, in one transaction), removes the user's `verification` rows just before, and ends the user's session. Catalog tables are untouched.
- **AC-14**: Every user data function takes the user id and filters on it. One user can never read or change another user's rows.
- **AC-15**: Schema changes ship only as Drizzle migrations that apply cleanly to an empty Neon branch. The first one enables pgvector. Every foreign key to `user.id` is a text column with `ON DELETE CASCADE`.
- **AC-16**: Lists that can grow (ratings, watchlist, imports) are paginated by an opaque cursor that never skips or repeats a row, with a default page size of 50 and a maximum of 100.
- **AC-17**: Every user has a profile row (created at sign up, or lazily on first read). A country set from the IP header never overwrites a country the user chose. Sign up records when and which terms version the user accepted.

## Decision

**Chosen option**: Option 1: Narrow relational tables, designed whole now, migrated slice by slice.

One table per meaning, Postgres only, with the full model decided here and each migration landing with the slice that first needs it. Taste profiles and recommendation reasons are computed when read, not stored.

**Implementation skills**: `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.claude/skills/drizzle-orm-patterns/`) · `neon-postgres` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres/`) · `better-auth-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-best-practices/`) · `typescript-advanced-types` (`wshobson/agents`, `.claude/skills/typescript-advanced-types/`)

## Rationale

Reasoning, options, and the full decision log: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**

Conventions: every timestamp is `timestamptz` in UTC with `default now()`. App tables use `bigint generated always as identity` ids for movies, people, imports, and `smallint` for genres. User rows use a composite key of (`user_id`, `movie_id`) and need no surrogate id. Every `user_id` is text and references `user.id` with `ON DELETE CASCADE`. Enum types are Postgres enums created through Drizzle.

*Better Auth tables* (not designed here): `user`, `session`, `account`, `verification`, `rate_limit`. Generated once with the Better Auth CLI `generate` into `src/db/auth-schema.ts`, committed, and owned by `drizzle-kit` from then on. The `verification` table is keyed by `identifier` (the email), not by user id, so cascade does not reach it (see AC-13).

*Catalog tables* (public data, no user ids)

| Table | Key | Columns (all required unless marked null) | Links and indexes |
|---|---|---|---|
| `movies` | `id` | `title`; `original_title` (null); `title_normalized`; `release_date` date (null, a plain date, not a timestamp, so the generated year is valid); `release_year` smallint (null, generated from `release_date`); `overview` (null); `runtime_minutes` (null); `poster_path` (null); `original_language` (null); `popularity` real (null); `vote_average` real (null); `fetched_at` (null); `search` tsvector (generated: `setweight(to_tsvector('english', coalesce(title,'')),'A') || setweight(to_tsvector('english', coalesce(overview,'')),'B')`); `created_at`; `updated_at` | Index (`title_normalized`, `release_year`); GIN on `search`; index on `popularity` desc |
| `movie_titles` | (`movie_id`, `title_normalized`) | `kind` (`primary`, `original`, or `alternate`); every movie has a `primary` row holding its main title, so a title lookup is one join with `movies.release_year` | `movie_id` to `movies` (cascade); index on `title_normalized` |
| `movie_external_ids` | (`provider`, `external_id`) | `movie_id` | `movie_id` to `movies` (cascade); unique (`movie_id`, `provider`) |
| `genres` | `id` | `name` unique | N:M to `movies` through `movie_genres` |
| `movie_genres` | (`movie_id`, `genre_id`) | none | both sides cascade; index (`genre_id`, `movie_id`) |
| `people` | `id` | `name`; `profile_path` (null) | N:M to `movies` through `credits` |
| `credits` | (`movie_id`, `person_id`, `role`) | `role` (`cast` or `director`); `billing_order` (null); `character_name` (null) | both sides cascade; index on `person_id` |
| `movie_embeddings` | (`movie_id`, `model`) | `dimensions` (check = 1024); `embedding` vector(1024); `text_hash`; `created_at` | `movie_id` to `movies` (cascade); HNSW index on `embedding` with cosine ops (default settings, kept for later growth) |

*User tables* (all deleted with the user)

| Table | Key | Columns | Links and indexes |
|---|---|---|---|
| `profiles` | `user_id` | `country` char(2) (null, upper case ISO code); `country_source` (`ip` or `user`, null when `country` is null); `onboarded_at` (null); `terms_accepted_at` (null); `terms_version` text (null); `created_at`; `updated_at` | 1:1 with `user` |
| `ratings` | (`user_id`, `movie_id`) | `score` smallint check 1 to 10; `source` (`swipe`, `import`, `manual`); `rated_at` (first rated); `updated_at` (last change) | `movie_id` to `movies` (restrict); index (`user_id`, `updated_at` desc, `movie_id` desc); index on `movie_id` |
| `watchlist_entries` | (`user_id`, `movie_id`) | `added_at` | `movie_id` restrict; index (`user_id`, `added_at` desc, `movie_id` desc) |
| `swipe_skips` | (`user_id`, `movie_id`) | `skipped_at` | `movie_id` restrict |
| `feed_feedback` | (`user_id`, `movie_id`) | `kind` (`not_interested` or `more_like_this`); `created_at` | `movie_id` restrict |
| `imports` | `id` | `user_id`; `status` (`completed` or `failed`); `rows_total`; `rows_matched`; `rows_unmatched`; `created_at`; `completed_at` (null, set when completed) | check: `status <> 'completed' OR rows_matched + rows_unmatched = rows_total`; index (`user_id`, `created_at` desc, `id` desc) |
| `import_unmatched_rows` | (`import_id`, `row_number`) | `title`; `year` (null); `score` (null); `reason` (`no_match`, `ambiguous`, `invalid_row`, `duplicate`) | `import_id` to `imports` (cascade) |
| `search_usage` | (`user_id`, `day`) | `day` date (UTC); `count` integer default 0 | `user_id` to `user` (cascade) |

*Relationships in words*: a user has one profile and many ratings, watchlist entries, skips, feedback rows, and imports. A movie has many titles, external ids, genres, credits, and embeddings, and is pointed at by user rows. An import has many unmatched rows.

*Slice coverage* (which tables each planned slice touches, and where its migration lands)

| Feature | Tables used | Migration lands with |
|---|---|---|
| 4 Movie catalog | `movies`, `movie_titles`, `movie_external_ids`, `genres`, `movie_genres`, `people`, `credits`, `movie_embeddings` | Migration 1 (this feature's build). Spec 0003 adds four nullable columns in its own migration: `movies.tagline`, `movies.vote_count`, `movies.source_missing_at`, and `people.tmdb_id` (unique). |
| 6 Email sign in | auth tables, `profiles` | Migration 1 |
| 7 Swipe onboarding | `ratings`, `swipe_skips`, `profiles.onboarded_at` | Migration 1 |
| 8 Recommender, 9 Feed | read `ratings`, `movie_embeddings`, genres, credits; compute reasons on read | Migration 1 (no new tables) |
| 10 Analytics | none (provider side) | none |
| 11 Letterboxd import | `imports`, `import_unmatched_rows`, `ratings`, `movie_titles`, `movie_external_ids` | Migration 2, with feature 11 |
| 12 Movie detail | `movies`, genres, `credits`, `people` | none |
| 13 Watchlist and seen | `watchlist_entries`, `ratings` | Migration 3, with feature 13 |
| 14 Feed feedback | `feed_feedback` | Migration 4, with feature 14 |
| 15 Bite search | `movie_embeddings`, `movies.search`, `search_usage` | Migration 5, with feature 15 |
| 16 Where to watch | `profiles.country`; availability table not designed here | Spec 16 adds one table |
| 17 Privacy | export and delete functions (this feature) | none |

**State transitions**

- `imports.status` has no transitions. A row is written once, as `completed` (inside the same transaction as the ratings) or as `failed` (a separate statement after the transaction rolled back).
- `profiles.onboarded_at` goes from null to a timestamp once, when the user finishes swipe onboarding (set by feature 7).
- A user's relation to one movie is one of: unseen, skipped, rated (which means seen), on the watchlist, with `not_interested` or `more_like_this` as an overlay. Rated and on the watchlist never hold at once.

**Code layout** (folder by feature)

- `src/db/`: `client.ts` (the shared `pg` Pool and Drizzle instance, also passed to Better Auth), `schema/` (`catalog.ts`, `user-data.ts`, `index.ts`), `auth-schema.ts` (generated), `drizzle.config.ts` at the root, migrations in `drizzle/`.
- `src/lib/result.ts`: the `Result<T, E>` type used by every function below.
- `src/catalog/normalize-title.ts`: the pure `normalizeTitle` function. Spec 4 adds the rest of this folder.
- `src/ratings/`: `swipe-score.ts`, `save-rating.ts`, `save-swipe.ts`, `list-ratings.ts`.
- `src/profile/`: profile read and upsert.
- `src/user-data/`: `exclusions.ts`, `export-user-data.ts`, `delete-account.ts`.

**API surface** (server only functions; there are no new routes. Callers are Server Actions and Route Handlers in later features. Each caller validates input with Zod and reads the user id from `auth.api.getSession({ headers })`, then passes it in. These functions never read the session themselves.)

| Function | Key inputs | Key outputs | Key errors |
|---|---|---|---|
| `saveRating` | `userId`, `movieId`, `score` (1 to 10), `source` | `Result<Rating>`; in one transaction: takes the per user and movie advisory lock, upserts, deletes the movie's watchlist entry and skip | `movie_not_found`, `user_not_found`, `invalid_score` |
| `saveSwipe` | `userId`, `movieId`, `choice` (`liked`, `disliked`, `not_seen`) | `Result<void>`; liked or disliked calls `saveRating` with `swipeScore(choice)`. Not seen takes the same advisory lock and inserts a skip only when no rating exists (`INSERT ... SELECT ... WHERE NOT EXISTS`, `ON CONFLICT DO NOTHING`); otherwise it does nothing | `movie_not_found`, `user_not_found` |
| `listRatings` | `userId`, `cursor?`, `limit?` (default 50, max 100) | `Result<{ items, nextCursor }>` ordered by `updated_at` desc, `movie_id` desc. The cursor is opaque base64 of `updated_at::text` (full microsecond precision, never a JS `Date`) and `movie_id`, compared as a row tuple. All list functions use this pattern. | `invalid_cursor` |
| `getProfile` / `upsertProfile` | `userId`; `country?`, `countrySource?` (`ip` or `user`), `termsVersion?` | `Result<Profile>`. `getProfile` creates the row if it is missing. The IP header may only write `country` when it is null or `country_source = 'ip'`; a user chosen country is never overwritten by it. | `invalid_country` |
| `unavailableMovies` | `userId`, `movieIdColumn`, `surface` (`deck` or `feed`) | A SQL fragment (`NOT EXISTS`) that deck and feed queries embed. Both surfaces hide rated, skipped, and `not_interested` movies. The deck also hides watchlisted movies; the feed keeps them. `more_like_this` movies stay visible. | none |
| `exportUserData` | `userId` | `Result<UserExport>` (shape below), built with all reads in one repeatable read transaction | `user_not_found` |
| `deleteAccount` | `userId` | Used inside Better Auth's `deleteUser` flow. A `beforeDelete` hook deletes the user's `verification` rows; Better Auth then deletes the `user` row (cascade does the rest) and ends the session. | `user_not_found` |
| `watchlist` functions (feature 13) | `userId`, `movieId` | add, remove, list with cursor; add refuses rated movies | `already_rated`, `movie_not_found` |
| `setFeedback` / `clearFeedback` (feature 14) | `userId`, `movieId`, `kind` | upsert or delete one row | `movie_not_found` |
| `saveImportResult` (feature 11) | `userId`, parsed counts, matched `{ movieId, score }[]`, unmatched rows | `Result<{ importId }>`; one transaction, chunks of 1000 rows. After each chunk of rating upserts it deletes the matching `watchlist_entries` and `swipe_skips` rows (`movie_id = ANY(ids)`), so import follows the same rule as `saveRating`. | `db_unavailable` |
| `consumeSearchQuota` (feature 15) | `userId` | `Result<{ remaining }>`; one atomic statement: `INSERT ... VALUES (user, day, 1) ON CONFLICT DO UPDATE SET count = search_usage.count + 1 WHERE search_usage.count < 30 RETURNING count`. No row returned means refused. | `quota_exceeded` (with reset time) |

Shared error handling: every function returns `Result`. Database connection failures map to `db_unavailable`. The caller maps each code to a user message at the edge. Functions never log row values. Foreign key errors (SQLSTATE 23503) map by constraint name: the movie key means `movie_not_found`, the user key means `user_not_found` (for example a write racing an account delete).

**Locking**: `saveRating`, the watchlist add, and `saveSwipe` each start by taking `pg_advisory_xact_lock(hashtextextended(userId || ':' || movieId, 0))`. Under the default isolation level, two parallel requests could otherwise each miss the other's uncommitted row and leave a movie both rated and watchlisted (or rated and skipped). The lock works through Neon's transaction pooling.

**Export shape** (`UserExport`, ISO 8601 UTC strings for every time):
`{ schemaVersion: 1, exportedAt, account: { id, email, name, emailVerified, createdAt }, profile, ratings: [{ movieId, title, year, stars, source, ratedAt, updatedAt }], watchlist, feedback, skips, imports: [{ id, status, rowsTotal, rowsMatched, rowsUnmatched, createdAt, completedAt, unmatched: [{ rowNumber, title, year, stars, reason }] }], searchUsage: [{ day, count }] }`. The completeness test covers tables that reach the user through a parent (`import_unmatched_rows` has no `user_id` of its own).

**Full text search**: queried with `websearch_to_tsquery('english', $q)` against `movies.search`, ranked by `ts_rank`, with a `limit`. Spec 15 owns the search function; this spec fixes the column and the query form.

**Vector search**: at the current catalog size (a few thousand movies) queries are exact (`ORDER BY embedding <=> $v` with the exclusion filter), which is fast and always returns a full page. If the HNSW index is used later, run the query with `SET LOCAL hnsw.iterative_scan = relaxed_order` (needs a recent pgvector; verify on the Neon project), because the index returns only about 40 candidates before filtering.

**Value sourcing**

| Action | Value produced or displayed | Source |
|---|---|---|
| `saveSwipe` | `score` for liked and disliked | Constants in `swipe-score.ts`: liked = 8, disliked = 2 (this spec) |
| `saveRating` | `rated_at`, `updated_at` | Database `now()` |
| `saveRating` | `source` | Caller's literal (`swipe`, `import`, `manual`) |
| Letterboxd import | `score` per row | Letterboxd stars times 2; a value that is not a multiple of 0.5 between 0.5 and 5 is an `invalid_row` |
| Letterboxd import | `rows_total`, `rows_matched`, `rows_unmatched` | Counted by the Route Handler after parsing and matching (spec 11). For a `failed` import: `rows_total` as parsed (0 if parsing failed), the other two 0 |
| Letterboxd import | `rated_at` and `updated_at` on insert | `rated_at` from the CSV `Date` column; `updated_at` is `now()`. On conflict, the existing `rated_at` is kept and `updated_at` is set to `now()` |
| Letterboxd import | duplicate movie in one file | The first row wins; later rows are stored as `duplicate` unmatched rows, because one upsert statement cannot touch a row twice |
| Catalog load | `title_normalized`, `movie_titles.title_normalized` | `normalizeTitle(title)`: Unicode NFKD, strip combining marks, lower case, `&` becomes `and`, every run of non letters and digits becomes one space, trim. Articles are kept. |
| Catalog load | `release_year`, `search` | Generated columns of `release_date`, `title`, `overview` |
| Catalog load | `fetched_at`, `popularity`, `vote_average` | The metadata provider response (spec 4) |
| Embedding job | `model`, `dimensions` | The embedding script's model constant and the API response; `dimensions` must equal 1024 |
| Embedding job | `text_hash` | SHA 256 hex of the exact input text (text recipe decided in spec 4) |
| Sign up | the `profiles` row | Created in Better Auth `databaseHooks.user.create.after` (feature 6), with `terms_accepted_at` set to `now()` and `terms_version` from a constant in code. `getProfile` creates it lazily if it is missing. |
| `upsertProfile` | `country`, `country_source` | The `x-vercel-ip-country` header read by the caller, upper cased, with source `ip`; or the user's choice with source `user`. Null when the header is missing (local development). |
| `consumeSearchQuota` | `day` | `(now() at time zone 'utc')::date` in SQL, never the client clock |
| `consumeSearchQuota` | reset time in `quota_exceeded` | Next UTC midnight, derived from `day` |
| `saveImportResult` | `status`, `completed_at` | `completed` with `now()` on commit; `failed` with null `completed_at` on rollback |
| `exportUserData` | movie title and year beside each id | Join to `movies` |
| `exportUserData` | stars | `score / 2` |
| `exportUserData` | account fields | `user`: `id`, `email`, `name`, `emailVerified`, `createdAt` only |
| `deleteAccount` | which `verification` rows to delete | Rows where `value = userId`, or `identifier` equals or contains the user's email (password reset rows store the user id in `value`; plugin rows embed the email in `identifier`). `user.email` is read in the hook. |
| Deck and feed queries | which movies to hide | `unavailableMovies(userId, movieIdColumn, surface)` |
| Movie detail "why recommended" (feature 12) | the reason text | The recommender's `reasonsFor(userId, movieId)`, computed on read (spec 8). Nothing passes through the URL and nothing is stored. |
| Quota refusal | when a search is charged | Before the provider call, and not refunded if the provider fails or the full text fallback runs |
| List functions | page cursor | `nextCursor` returned by the previous page (opaque) |

**Key invariants**

- One rating per (user, movie); `score` between 1 and 10 (database check).
- A movie is never both rated and on the same user's watchlist, and never both rated and skipped. The application enforces it inside the transaction under the per user and movie advisory lock, and watchlist reads also filter out rated movies as a second guard. Import follows the same rule.
- One feedback row per (user, movie).
- `movie_embeddings.dimensions` equals 1024 and the vector has 1024 entries. A different size means a new table through a migration.
- `imports.rows_matched + imports.rows_unmatched = imports.rows_total` for `completed` rows (database check).
- `search_usage.count` never exceeds 30 per UTC day. The cap is enforced in the upsert's `WHERE`, not by a check constraint, so changing it is a code change.
- Movies referenced by user rows cannot be deleted (`ON DELETE RESTRICT`). The app never deletes a movie row. When TMDB withdraws a movie, catalog sync (spec 0003) keeps the row, sets `movies.source_missing_at`, and clears its TMDB content, so user ratings and lists keep working.
- Pure helpers (`normalizeTitle`, `swipeScore`) have no side effects. Database and clock access stay in the functions above.

**Security model**

- Personal data here is ratings, watchlist, feedback, imports, country, and the Better Auth account. The scope names no legal regime; spec 17 decides which one applies. Ratings content never goes to analytics or logs.
- Access control is application level only. Every user table query filters on the `userId` argument, and no function accepts a user id from the browser. Row level security was considered and not adopted (see rationale).
- Catalog tables are public data and carry no user ids.
- Export excludes `account` (password hashes, tokens), `session`, and `verification`. It is generated only for the signed in user.
- Account deletion goes through Better Auth's `deleteUser` flow so the session and cookie end with the account. Whether to require a fresh sign in before deleting is left to spec 17; the recommendation is to require it.
- Only server code touches the database. All database code runs on the Node.js runtime.

**Configuration required**

All names come from spec 0001; this build adds them to `src/env.ts` and `.env.example`.
- `DATABASE_URL`: pooled Neon connection, used by the app.
- `DATABASE_URL_UNPOOLED`: direct connection, used by `drizzle-kit` migrations.
- `DATABASE_URL_TEST`: the Neon test branch, reset per test run.
- `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`: needed only so the Better Auth CLI can load a minimal config for `generate`.
- Prerequisite: the `vector` extension is enabled on the Neon project, and a dev branch and a test branch exist.

**Critical test scenarios** (written afterwards by `/test`; all run against the Neon test branch)

- Happy path: swipe liked, disliked, and not seen on three movies; ratings hold 8 and 2 and one skip exists; the exclusion filter hides all three, verifies **AC-4**, **AC-5**
- Happy path: rate a movie twice with different scores; one row remains with the newer score and source, verifies **AC-2**
- Happy path: look up "Amélie" (accent and case variants) and an alternate title with the right year; the same movie returns, verifies **AC-9**
- Happy path: insert a few embeddings, run an exact cosine query with an exclusion, and check the nearest unexcluded movie returns; then run it again with `SET LOCAL enable_seqscan = off` to confirm the HNSW index works, verifies **AC-7**
- Happy path: a movie with a null overview is found by a title query, and a title match ranks above an overview match, verifies **AC-8**
- Happy path: list ratings across several pages with rows sharing one millisecond; no row is skipped or repeated, verifies **AC-16**
- Happy path: the IP header sets `country` for a new profile, a user choice sets source `user`, and a later header does not overwrite it, verifies **AC-17**
- Happy path: full text query for words in a title and in an overview returns ranked rows, verifies **AC-8**
- Happy path: export a user with rows in every user table; the JSON has titles, stars, no hashes or tokens, verifies **AC-12**
- Failure case: a database check rejects score 0 and 11; a vector of the wrong size is rejected, verifies **AC-2**, **AC-7**
- Failure case: double tap swipe sends the same swipe twice in parallel; one row, no error, verifies **AC-4**
- Failure case: 40 parallel `consumeSearchQuota` calls; exactly 30 succeed, verifies **AC-11**
- Failure case: parallel `saveRating` and watchlist add (and `saveRating` and a not seen swipe) for the same user and movie, many times; the movie is never in both states, verifies **AC-3**, **AC-4**
- Failure case: a not seen swipe on an already rated movie writes nothing, verifies **AC-4**
- Failure case: delete an account while another request writes a rating; the write returns `user_not_found`, and no rows remain, verifies **AC-13**
- Failure case: an import with a duplicate movie and an invalid star value stores them as unmatched rows with reasons and counts add up; a forced failure stores `failed` and no ratings, verifies **AC-10**
- Failure case: rate a movie that is on the watchlist; the watchlist entry is gone; adding it back returns `already_rated`, verifies **AC-3**
- Completeness: a test lists every table with a `user_id` column from the Drizzle schema and asserts each appears in the export and is empty after `deleteAccount`. A new user table fails this test until it is wired into both, verifies **AC-12**, **AC-13**
- Auth/permission: user A calls every function with user B's movie ids and gets only A's rows; no function returns B's data, verifies **AC-14**
- Failure case: apply all migrations to an empty branch, verifies **AC-15**

## Build plan

Build approach: Tracer Bullet (from `AGENTS.md`). This foundation has no screen, so the thin thread runs from migration to typed function to a test on a real Neon branch. Migration 1 holds only what features 4, 6, 7, 8, and 9 need; later tables arrive with their own features, each extending export and delete. Tests are written by `/test` after the build (Beta workflow).

Built by `/develop data model`:

1. Database foundation: add `drizzle-orm`, `pg`, `drizzle-kit`, `@types/pg`, `better-auth`; create `src/env.ts` entries and `.env.example` for the database names; `src/db/client.ts` with one shared Pool (no named prepared statements, because Neon's pooler runs in transaction mode); `drizzle.config.ts` using `DATABASE_URL_UNPOOLED`; scripts `db:generate`, `db:migrate`. Confirm the dev and test Neon branches exist and pgvector can be enabled. Satisfies **AC-15**
2. Auth schema: a minimal Better Auth config (email and password on, `rateLimit` with database storage) used only to run the CLI `generate`; commit `src/db/auth-schema.ts`. Satisfies **AC-13**, **AC-15**
3. Helpers: `src/lib/result.ts`, `normalizeTitle`, `swipeScore`. Satisfies **AC-4**, **AC-9**
4. Schema files for migration 1 and the generated migration: `CREATE EXTENSION IF NOT EXISTS vector`, auth tables, `profiles`, all catalog tables, `ratings`, `swipe_skips`, with every index, check, and enum above. `drizzle-kit generate` does not write `CREATE EXTENSION`, so add it by hand at the top of migration 1, before the first vector column. The migrator runs pending migrations in one transaction, so never use a newly added enum value in the migration that adds it. Satisfies **AC-1**, **AC-2**, **AC-7**, **AC-8**, **AC-9**, **AC-15**
5. Slice 1 functions: `saveRating`, `saveSwipe`, `listRatings`, `getProfile` (lazy create), `upsertProfile` (with `country_source`), `unavailableMovies(userId, movieIdColumn, surface)`, the shared cursor helper, and the advisory lock helper. Satisfies **AC-2**, **AC-4**, **AC-5**, **AC-14**, **AC-16**, **AC-17**
6. Export and delete for the migration 1 tables: `exportUserData` with the `UserExport` shape, the `deleteAccount` cleanup function shaped to plug into Better Auth's `deleteUser` `beforeDelete` hook (feature 6 wires the hook), plus the completeness test hook described above. Satisfies **AC-12**, **AC-13**, **AC-14**

Built later, inside the owning feature's `/develop` run (each also extends export, delete, and the completeness test):

7. Migration 2 with feature 11: `imports`, `import_unmatched_rows`, `saveImportResult`, `listImports`. Satisfies **AC-10**, **AC-16**
8. Migration 3 with feature 13: `watchlist_entries`, watchlist functions, and the watchlist step inside `saveRating`. Satisfies **AC-3**, **AC-16**
9. Migration 4 with feature 14: `feed_feedback`, `setFeedback`, `clearFeedback`, and the not interested clause in `unavailableMovies`. Satisfies **AC-5**, **AC-6**
10. Migration 5 with feature 15: `search_usage`, `consumeSearchQuota`, and a purge of rows older than 30 days. Satisfies **AC-11**

Traceability: AC-1 is satisfied by the design itself (the slice coverage table) and re checked at each of tasks 7 to 10.

## Consequences

**Positive**:
- Later slices add tables without reshaping old ones, so there is no breaking migration on the path to launch.
- Each table has one meaning and a primary key that enforces its rule, so the rules are hard to break by accident.
- Export and delete are short because every user table hangs off `user.id`, and the completeness test stops a new table from being forgotten.
- Nothing derived is stored, so ratings and recommendations cannot drift apart.
- Provider neutral external ids and a separate embeddings table keep spec 4's data source choice and any model change cheap.

**Negative / tradeoffs**:
- The movie columns are designed before spec 4 picks the data source. They are modelled on common metadata (title, dates, overview, popularity); spec 4 may add columns, and a column it cannot fill stays null.
- Computing taste and reasons on every read costs query time as ratings grow. At a few thousand movies and hundreds of ratings per user this is fine; if profiling shows a problem, a cache table is an additive change.
- The "never both rated and watchlisted" rule lives in the application, not the database. A coding mistake could break it, which is why watchlist reads also filter rated movies and a test covers it.
- Hard delete is immediate and cannot be undone. There is no grace period.
- Vector queries run as exact scans for now. That is fast at a few thousand movies, but it will need the HNSW index (with iterative scan) once the catalog grows by an order of magnitude. The index also serves one embedding model at a time: a second model of the same size needs a partial index per model, and a different size needs a new table.
- Per user and movie advisory locks add a small cost to every rating write, in return for removing a race that would leave contradictory rows.
- Export is built in one request. A very large account (an import near the 2 MB cap) can produce a response near Vercel's body limit, so the export Route Handler streams it.
- `rate_limit` rows hold IP based keys and `verification` rows hold email addresses; neither is cascaded by user id. `deleteAccount` handles `verification`; `rate_limit` needs its own purge (see Follow-up).

**Neutral**:
- Embedding dimension is settled at 1024 (the default size of the Voyage model family checked on 2026-11-08). Spec 0001 asked this spec to decide it.
- Migration order follows the slices, so migration numbers are not grouped by theme.

## Follow-up

- [x] Spec 4 (movie catalog): add provider specific columns and person external ids additively; load `movie_titles` and `movie_external_ids`; use `normalizeTitle` for every key; write embeddings with model name and dimension; keep `fetched_at` honest for the TMDB six month caching limit. Decided in spec [0003](../0003-movie-catalog/index.md); built with feature 4.
- [ ] Verify before building: pgvector is enabled on the Neon project; Drizzle's syntax for an HNSW index, a vector column, and a generated tsvector column (likely a custom type) matches the installed version; Vercel's response body limit for streamed responses.
- [ ] Voyage facts to re check at build: the current model name, that it offers a 1024 dimension output, and the free allowance. Voyage's own pages disagree on which models get free tokens.
- [ ] Spec 16 (where to watch): design the streaming availability table; it will point at `movies` and be additive.
- [ ] Spec 11 (Letterboxd import): decide how many past imports a user keeps, and the exact matching rules (this spec only fixes the key, the reasons, and the storage).
- [ ] Spec 17 (privacy): list data processors; decide whether export and delete need an audit record (this spec adds none and logs no content); decide retention for IP based `rate_limit` rows; confirm the legal regime.
- [ ] Spec 15 (bite search): wire the purge of old `search_usage` rows into the daily cron. Also purge expired `rate_limit` rows there, because Better Auth does not.
- [ ] Verify against the installed Better Auth version before building: how password reset and plugin rows are stored in `verification` (the cleanup rule in *Value sourcing* comes from a cross check, not from reading the library), and that `deleteUser` with a `beforeDelete` hook works as described.
- [ ] Spec 17 (privacy): decide whether deleting an account requires a fresh sign in (recommended: yes); state the Neon point in time restore window; forbid branching production data into dev or preview branches.
- [ ] Duplicate movie merge procedure that re points user rows (user to movie keys are `RESTRICT`): deferred. Spec [0003](../0003-movie-catalog/index.md) only reports movies that share a title key and year and makes the matcher return `ambiguous`; it fills `movie_titles` with a `primary` row for every movie. Design a merge only if real duplicates show up.
- [ ] Spec 8 (recommender): provide `reasonsFor(userId, movieId)` for the detail page.
- [ ] Rule for every later slice that adds a user table: extend `exportUserData`, `deleteAccount`, and the completeness test in the same change.
- [x] Scope row 3 links this spec and lists the milestones from the Build plan.

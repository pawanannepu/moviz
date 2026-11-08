# Verify: Data model · spec 0002 · updated 2026-11-08
_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

All steps run against the Neon test branch (`DATABASE_URL_TEST`), never dev or production.

## UI / manual
This feature has no screen. Nothing to click.

## Commands
- [x] Reset the test branch, then `pnpm db:migrate` (or the Drizzle migrator) → all migrations apply to an empty branch; 16 tables, `vector` extension, 4 check constraints, a GIN index on `movies.search`, an HNSW index on `movie_embeddings.embedding`      → AC-15, AC-1, AC-7
- [x] Every foreign key to `user.id` is a text column with `ON DELETE CASCADE`; the two user to movie keys are `RESTRICT` → AC-15
- [x] Insert a rating with score 0, then 11 → the database check rejects both; `saveRating` returns `invalid_score` for 0, 11, 1.5, NaN → AC-2
- [x] Insert an embedding with a vector of the wrong size, and one with `dimensions = 512` → both rejected → AC-7
- [x] `saveRating` twice for one user and movie with different scores and sources → one row with the newer score and source, `rated_at` unchanged, `updated_at` later → AC-2
- [x] `saveSwipe` liked, disliked, not seen on three movies → ratings hold 8 and 2 with source `swipe`, one skip row, no rating for the not seen movie → AC-4
- [x] `unavailableMovies(userId, movies.id, "deck")` and `"feed"` → both hide the three swiped movies for that user and hide nothing for another user → AC-5
- [x] `saveSwipe` not seen on an already rated movie → no skip row is written → AC-4
- [x] `saveRating` on a skipped movie → the skip row is gone → AC-3
- [x] Send the same liked swipe four times in parallel, and the same not seen swipe four times in parallel → no errors, one row each → AC-4
- [x] Race `saveRating` against two `not_seen` swipes for one user and movie, 25 rounds → no movie is ever both rated and skipped → AC-3, AC-4
- [x] `saveRating` with an unknown movie id, and with an unknown user id → `movie_not_found`, `user_not_found` → AC-13
- [x] Look up "AMELIE" and "amélie" with the right year, an alternate title with the right year, and "Amélie" with the wrong year → the same movie, the same movie, then no match → AC-9
- [x] `websearch_to_tsquery('english', 'heat')` ranked by `ts_rank` → the movie titled "Heat" ranks above a movie whose overview only says "heat wave"; a movie with a null overview is found by title → AC-8
- [x] Insert three embeddings, run `ORDER BY embedding <=> $v` with and without the exclusion filter → nearest movie is right; nearest unexcluded movie skips the user's rated and skipped movies → AC-7, AC-5
- [x] `SET LOCAL enable_seqscan = off` then `EXPLAIN` the same query → the plan uses `movie_embeddings_embedding_hnsw_idx` → AC-7
- [x] Insert 7 ratings with the same `updated_at` to the microsecond, then `listRatings` with limit 3 until `nextCursor` is null → every row seen once; a garbage cursor returns `invalid_cursor`; limit 5000 returns at most 100 → AC-16
- [x] `upsertProfile` with country `in` and source `ip`, then `GB` with source `user`, then `FR` with source `ip` → `IN`, then `GB` with source `user`, then still `GB`; `USA`, `1` and an empty string return `invalid_country` → AC-17
- [x] `upsertProfile` with only `termsVersion` → `terms_version` and `terms_accepted_at` are set; a later country write keeps them → AC-17
- [x] `getProfile` for a user with no profile row → a row is created; for an unknown user → `user_not_found` → AC-17
- [x] `exportUserData` for a user who also has session, account and verification rows → JSON has `schemaVersion: 1`, the account fields, ratings with title, year and stars (score divided by 2), skips, ISO UTC times; it contains no password hash, session token or `verification` value; only that user's rows → AC-12, AC-14
- [x] Every table with a `user_id` column (`listTablesWithUserId()`) is either in `EXPORT_KEY_BY_TABLE` or in `AUTH_TABLES_OUTSIDE_EXPORT` → AC-12, AC-13
- [x] `deleteAccount` for a user with data in every table → no `user_id` table has a row for them; their `verification` rows (by `value`, by email, any letter case) are gone; another user's rows, their `verification` rows and all catalog rows are untouched → AC-13, AC-14
- [x] `deleteAccount` twice, and `saveRating` after delete → `user_not_found` each time; `deleteAccount` racing 12 parallel `saveRating` calls → only ok or `user_not_found`, no rating rows left → AC-13
- [x] User A calls `listRatings`, `exportUserData` and `unavailableMovies` while user B has data → only A's rows come back → AC-14

## Value sourcing
- [x] Liked swipe saves 8, disliked saves 2 (constants in `swipe-score.ts`) → AC-4
- [x] `rated_at` and `updated_at` come from the database `now()`, not the app clock → AC-2
- [x] `source` is exactly the caller's literal → AC-2
- [x] `title_normalized` on `movies` and `movie_titles` comes from `normalizeTitle`; `release_year` and `search` are generated columns → AC-9, AC-8
- [x] `country_source` comes from the caller; the header country is upper cased before saving → AC-17
- [x] Export `stars` is score divided by 2; account fields are `id`, `email`, `name`, `emailVerified`, `createdAt` only → AC-12
- [ ] Deck and feed hiding comes only from `unavailableMovies(userId, movieIdColumn, surface)` → AC-5
- [x] List cursors come only from the previous page's `nextCursor`, in `updated_at::text` microsecond form → AC-16

## Not covered yet (arrive with their features)
- AC-3 watchlist half, AC-6, AC-10, AC-11, and the watchlist, feedback, imports and search usage keys of the export.

## Acceptance-criteria coverage
- AC-1 migration step · AC-2 rating steps · AC-3 skip removal and race steps (watchlist half later) · AC-4 swipe steps · AC-5 exclusion steps · AC-7 vector steps · AC-8 full text steps · AC-9 title lookup step · AC-12 export and registry steps · AC-13 delete steps · AC-14 per user steps · AC-15 migration and foreign key steps · AC-16 paging step · AC-17 profile steps
- AC-6, AC-10, AC-11: later features (14, 11, 15)

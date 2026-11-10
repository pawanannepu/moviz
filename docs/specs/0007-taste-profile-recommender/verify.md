# Verify: Taste profile & recommender · spec 0007 · updated 2026-11-10
_Steps derived from spec 0007 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

There is no UI in this feature. Every step calls `recommendMovies(db, input)` from `src/recommend/recommend-movies.ts` (in a test or a script) against a Neon branch that has embeddings (`pnpm embed:catalog`).

## UI / manual
- [x] Rate one action movie 9 and one comedy 2, call with `limit` 20 → the closest unrated action movie is first, its reason is `similar_to_liked` with the action movie as anchor, and a movie near the comedy ranks below an equally close neutral one → AC-3, AC-6
- [x] Call twice with the same data → the same ids in the same order; ties go to the lower movie id → AC-1
- [x] Save swipe 8, swipe 2, manual 10 and import 1 ratings → weights are about +0.56, -0.78, +1 and -1, whatever the source → AC-4
- [x] Give a user 35 liked and 15 disliked ratings, then 40 dislikes of score 1 with 3 likes → exactly the 30 and 10 strongest are anchors in the first case; in the second the 3 likes are still anchors → AC-5
- [x] Check `profile.strength` with 0, 1, 4 and 5 liked ratings → `none`, `thin`, `thin`, `ok`; the counts ignore the anchor cap → AC-7, AC-9
- [x] A user with no ratings, one with only dislikes, and one whose liked movies have no embedding → popular order (most votes first, null `vote_count` last), reason `popular`, a movie without an embedding may appear → AC-8, AC-13
- [x] Two candidates whose taste differs by less than 0.1 → the better voted one wins; with a taste gap above 0.1 the closer one wins whatever the votes; a null `vote_average` or `vote_count` still gives a number → AC-10
- [x] `limit` 20 with 7 liked anchors → no anchor is the reason for more than 3 picks while other candidates remain; with 1 liked anchor the batch still fills; the final list is sorted by score then id → AC-1, AC-11
- [x] A user with likes but no embedded candidate → popular order with reason `popular`, `strength` still the real value → AC-18
- [x] Page 1, then page 2 with `shown` set to page 1's ids, then rate a movie and fetch page 3 → no repeats, no rated movie → AC-2, AC-12
- [x] Rate a movie just before a call → it is gone from the result and no stored row needed refreshing → AC-14
- [x] `limit` 0, 51 and 2.5, an empty `userId`, 501 shown ids, a shown id of 0 and one above `Number.MAX_SAFE_INTEGER` → each returns `invalid_input` and reads nothing; duplicates in `shown` behave like no duplicates → AC-15
- [x] A candidate with a negative cosine to a disliked anchor gets no bonus; with no dislikes `neg` is 0 → AC-3
- [x] Point the call at an unreachable database → `db_unavailable`, nothing thrown; an empty catalog gives `picks: []` plus the profile → AC-15
- [x] An embedding row for another model is ignored; a movie the catalog marked missing is neither candidate nor anchor → AC-13, AC-2, AC-5
- [x] Two users with different ratings get different results; a spy on `console` during a run records no rating, title, score or movie id → AC-16

## Commands
- [x] `pnpm typecheck && pnpm check` → clean → all
- [x] Capture the queries of a call with 60 ratings and `limit` 50, and of one with 5 ratings and `limit` 5 → the same number of queries, all inside one `read only` `REPEATABLE READ` transaction, and every read of `ratings` or `swipe_skips` binds the given `userId` → AC-16, AC-17, AC-19
- [x] On the dev Neon branch with the full seeded catalog, run `EXPLAIN ANALYZE` on the scoring query (`src/recommend/score-candidates.ts`) → no use of the HNSW index; note the time of one call for a user with 40 anchors here → AC-17 (build plan task 6)

## Measurements (2026-11-10, /check verify)
- Dev branch (210 movies, pgvector 0.8.6, Postgres 18.6), 40 synthetic anchors, made up user: no HNSW in the plan, execution 45.9 ms, about 56,000 buffer hits for 8,400 pairs.
- Test branch at full size (3,210 embedded listable movies), a real user with 30 liked and 10 disliked ratings, `limit` 50: no HNSW in the plan, 126,800 pairs, execution 718 ms, 847,944 buffer hits and a small spill to temp (about 1,048 blocks). One `recommendMovies` call took 4.7 s cold, then 2.9, 2.5 and 3.1 s from a laptop (6 statements, including begin and commit, so network round trips are part of it).
- Query count: 6 statements per call (begin, 4 reads, commit) for 5 ratings with `limit` 5 and for 60 ratings with `limit` 50.

## Acceptance-criteria coverage
- AC-1 … steps 1, 2, 8 · AC-2 … steps 10, 15 · AC-3 … steps 1, 13 · AC-4 … step 3 · AC-5 … steps 4, 15 · AC-6 … step 1 · AC-7 … step 5 · AC-8 … step 6 · AC-9 … step 5 · AC-10 … step 7 · AC-11 … step 8 · AC-12 … step 10 · AC-13 … steps 6, 15 · AC-14 … step 11 · AC-15 … steps 12, 14 · AC-16 … step 16 and the capture step · AC-17 … the capture step and EXPLAIN step · AC-18 … step 9 · AC-19 … the capture step

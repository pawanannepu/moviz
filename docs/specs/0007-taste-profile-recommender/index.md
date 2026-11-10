# 0007. Taste profile and recommender: rank by closeness to rated movies, computed on read

**Date**: 2026-11-10
**Status**: In Progress

## Summary

The recommender turns a user's ratings into a ranked list of movies they have not dealt with yet, and every pick says which rated movie it came from ("because you rated Heat highly"). It compares each candidate movie with the movies the user rated, using the plot and cast vectors (embeddings) the catalog already stores, so it adds no table and no migration. Nothing about taste is stored: it is computed each time the feed asks. This is a server function only. Feature 9, the feed, calls it and writes the sentences.

## Requirements

Seeded from scope feature 8 ("Taste profile & recommender"). Its done when line is: given a user's ratings, it returns a ranked list that excludes movies they have rated, and each result carries the reasons it was ranked. Spec 0006 adds one constraint: a user can finish onboarding with fewer than 10 ratings when the deck runs out, so a thin profile must still work.

**User stories**:
- As a user who liked a few movies, I want picks close to those movies so that the feed feels made for me.
- As a user, I want each pick to name the movie it came from so that I can see why it was chosen and trust it.
- As a user who disliked a movie, I want picks near it to rank lower so that I do not see more of what I did not enjoy.
- As a user with only a handful of ratings, I want to still get picks, and to be told they are early guesses.
- As the builder of the feed, I want a stable, paged, typed result so that "load more" never repeats a movie or breaks when the user rates something in between.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: `recommendMovies` returns at most `limit` picks (default 20, allowed 1 to 50), sorted by score from highest to lowest, with ties broken by movie id ascending. The same data and the same call give the same list in the same order. This holds for the final list after the variety pass in AC-11, which is sorted again by score and then id.
- **AC-2**: A pick is never a movie the user has rated or skipped (the shared `unavailableMovies(..., "feed")` filter), never a movie that is not listable (`isListable()`), and never a movie whose id is in `shown`.
- **AC-3**: In taste mode a movie's score is `taste + PRIOR_WEIGHT * prior`. `taste = pos - NEGATIVE_WEIGHT * neg`. `pos` is the largest value of `weight * similarity` over the user's liked anchors, and `neg` is the largest value of `|weight| * similarity` over the disliked anchors, or 0 with none. `similarity` is cosine similarity between the two movies' embeddings for `EMBEDDING_MODEL`. A movie closer to a liked anchor ranks above a movie further from it, and a movie close to a disliked anchor ranks below an equally close match that is not. With no disliked anchor `neg` is 0, and `neg` is never below 0 (a negative cosine counts as 0), so a dislike can only lower a score.
- **AC-4**: A rating's weight is `(score - 5.5) / 4.5`, so 10 is +1, 1 is -1, a swipe like (8) is about +0.56 and a swipe dislike (2) is about -0.78. A rating is liked when its score is 6 or more and disliked when it is 5 or less. The rating's source (`swipe`, `import`, `manual`) does not matter.
- **AC-5**: The anchors are the user's rated movies that have an embedding for the current model: up to the 30 strongest liked ones and up to the 10 strongest disliked ones. Strongest means largest absolute weight, then newest `updated_at`, then highest movie id. Dislikes can never crowd the likes out.
- **AC-6**: Every taste pick carries exactly one reason, `{ kind: "similar_to_liked", anchor }`, where the anchor is the liked rated movie that produced the pick's `pos` (ties go to the lower movie id). The anchor holds `movieId`, `title`, `releaseYear` (or null) and the user's `score`. The anchor is always a movie the user rated 6 or higher.
- **AC-7**: The result carries a taste profile summary `{ likedCount, dislikedCount, strength }`. The counts are the user's liked and disliked ratings that have a current embedding, not limited to the anchor cap. `strength` is `none` with 0 liked, `thin` with 1 to 4, and `ok` with 5 or more.
- **AC-8**: With `strength` `none` (no ratings, only dislikes, or liked movies that have no embedding) the picks are the listable, available movies ordered by `vote_count` descending with `NULLS LAST` written explicitly (Postgres puts nulls first on a descending sort), then id ascending. Each carries the reason `{ kind: "popular" }`. A movie without an embedding is allowed in this mode.
- **AC-9**: With `strength` `thin` or `ok` the picks are ranked by taste. `thin` changes only the flag the feed reads, never the ranking rules.
- **AC-10**: The popularity nudge is `prior = clamp(vote_average / 10, 0, 1) * min(1, ln(1 + vote_count) / ln(1 + 5000))`, with a missing value counted as 0 (`coalesce` inside the query, because `ln(1 + NULL)` would turn the whole score into NULL), and is multiplied by `PRIOR_WEIGHT` (0.1). It adds at most 0.1 to a score, so it cannot reverse a taste gap larger than 0.1.
- **AC-11**: Within one batch, no single anchor is the reason for more than `cap = max(3, ceil(limit / likedAnchorCount))` picks while other candidates remain, where `likedAnchorCount` is the number of liked anchors actually loaded, `min(likedCount, 30)`. A first pass walks the ranked candidates and skips any pick that would exceed the cap. A second pass fills any slots left, in score order, ignoring the cap. A batch is therefore filled whenever enough candidates exist. The final list is then sorted by score and then movie id, so AC-1 holds after the fill pass. This applies to taste mode only.
- **AC-12**: Paging is stateless. The caller passes `shown`, up to 500 movie ids, and gets the next best picks not in it. Rating a movie between two calls changes the scores but never repeats a movie, because rated movies are already excluded.
- **AC-13**: In taste mode a candidate without an embedding for the current model is left out. An embedding for another model is ignored.
- **AC-14**: Nothing is stored. There is no new table, column or migration, and a rating saved just before a call changes that call's result.
- **AC-15**: A `limit` outside 1 to 50, a non integer, an empty `userId`, more than 500 shown ids, a non positive id or an id above `Number.MAX_SAFE_INTEGER` returns `invalid_input`. Duplicate ids in `shown` are allowed and removed. A database that cannot be reached returns `db_unavailable`. Neither throws. Any other exception is a bug and is rethrown, following `src/db/failure.ts`. An empty catalog returns `picks: []` with the profile summary.
- **AC-16**: The function only reads. It reads only the given user's rating rows and public catalog rows, and it writes nothing. Every read of `ratings` or `swipe_skips` binds the given `userId`. No log line, thrown message or error body holds a rating, score, title or movie id.
- **AC-17**: The number of queries does not grow with `limit` or with the number of ratings (no query per pick, no query per anchor).
- **AC-18**: When taste mode finds no candidate at all (for example no listable movie has an embedding yet), the picks come from the popular fallback with reason `popular`, while `strength` still reports the user's real strength.
- **AC-19**: All reads of one call run in one read only transaction at `REPEATABLE READ`, so the counts, the anchors, the scores and the reasons come from one snapshot. A rating changed during a call cannot make a reason say "liked" for a movie now rated low.

## Decision

**Chosen option**: Option 1: score each candidate by its closest liked and disliked rated movie, computed on read inside Postgres.

Build `src/recommend/`: pure rules for weights, strength and the variety cap, one SQL scoring read over the existing `movie_embeddings`, and one function, `recommendMovies`, that returns ranked picks with a structured reason and a small taste summary.

**Implementation skills**: `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.claude/skills/drizzle-orm-patterns/`) · `neon-postgres` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres/`) · `typescript-advanced-types` (`wshobson/agents`, `.claude/skills/typescript-advanced-types/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`)

Next.js 16 has breaking changes (root `AGENTS.md`), but this feature touches no route or page, so no Next.js guide is needed here.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no new table, no new column, so no migration. The recommender reads these existing tables and writes none.

| Existing table | Used for |
|---|---|
| `ratings` (`user_id`, `movie_id`, `score`, `source`, `updated_at`) | The user's liked and disliked anchors and the counts |
| `movie_embeddings` (`movie_id`, `model`, `embedding`) | Cosine similarity, only rows where `model = EMBEDDING_MODEL` |
| `movies` (`vote_count`, `vote_average`, `title`, `release_year`, `poster_path`) | The popularity nudge, the fallback order, the anchor title and the card fields |
| `movie_genres`, `genres` | Genre names for the picks, read for the final picks only |
| `swipe_skips`, `ratings` | Excluded through `unavailableMovies(userId, movies.id, "feed")` |

Constants live in one file, `src/recommend/weights.ts`, so tuning later is one edit: `RATING_MIDPOINT` 5.5, `RATING_SPAN` 4.5, `NEGATIVE_WEIGHT` 0.5, `PRIOR_WEIGHT` 0.1, `PRIOR_FULL_VOTES` 5000, `LIKED_ANCHORS` 30, `DISLIKED_ANCHORS` 10, `THIN_BELOW` 5, `MIN_VARIETY_CAP` 3, `CANDIDATE_FETCH` 300, `DEFAULT_LIMIT` 20, `MAX_LIMIT` 50, `MAX_SHOWN` 500.

**State transitions**: `strength` is derived from the liked count at read time. It is never stored.

| Usable liked ratings | `strength` | Mode | Reason on each pick |
|---|---|---|---|
| 0 | `none` | popular fallback | `popular` |
| 1 to 4 | `thin` | taste | `similar_to_liked` |
| 5 or more | `ok` | taste | `similar_to_liked` |

**API surface** (a server only function, no Route Handler and no Server Action in this feature):

| Function | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|
| `recommendMovies(db, input)` in `src/recommend/recommend-movies.ts` | `userId`: string (req), `limit`: integer 1 to 50 (opt, default 20), `shown`: array of up to 500 positive integers (opt) | `{ picks: Pick[], profile: TasteProfile }` | The caller reads the live session and passes the user id; this function never reads the request | `invalid_input`, `db_unavailable` |
| `ratingWeight(score)` | integer 1 to 10 | number from -1 to +1 | none, pure | none |
| `tasteStrength(likedCount)` | non negative integer | `none`, `thin` or `ok` | none, pure | none |
| `pickWithVariety(ranked, limit, cap)` | ranked candidates with their anchor ids | the chosen picks in order | none, pure | none |

Types (exported, with a short doc comment each, because feature 9 imports them):

```ts
type Reason =
  | { kind: "similar_to_liked"; anchor: { movieId: number; title: string; releaseYear: number | null; score: number } }
  | { kind: "popular" };
type Pick = { movie: MovieCardMovie; reason: Reason };
type TasteProfile = { likedCount: number; dislikedCount: number; strength: "none" | "thin" | "ok" };
type Recommendations = { picks: Pick[]; profile: TasteProfile };
```

`MovieCardMovie` is the shape from spec 0004 (`id`, `title`, `releaseYear`, `posterPath`, `genres`), so a pick can go straight into a feed card.

Internal functions take an `Executor` (a database or a transaction, from `src/db/create-db.ts`) first and return a `Result`. `recommendMovies` opens one `db.transaction` with `accessMode: "read only"` and `isolationLevel: "repeatable read"` and passes that transaction to all of them, so every read sees one snapshot (AC-19):

| Function | File | Does |
|---|---|---|
| `loadTaste` | `load-taste.ts` | Counts usable liked and disliked ratings, and loads the capped anchors as ids, weights, titles, years and scores only. It never loads an embedding into Node |
| `scoreCandidates` | `score-candidates.ts` | One SQL read in the shape below: every listable, available, embedded candidate not in `shown`. It returns `ScoredCandidate` rows, `{ movieId, anchorId, score }`, ordered by score descending then id ascending, limited to `CANDIDATE_FETCH`. The `score` is internal so tests can check AC-3 and AC-10, and it is not part of `Pick` |
| `popularCandidates` | `popular-candidates.ts` | The fallback read: listable, available movies not in `shown`, by `vote_count` descending `NULLS LAST` then id, limited to `limit`. Also used when taste mode finds no candidate (AC-18) |
| `loadPickCards` | `load-pick-cards.ts` | One read of card fields and genre names for the chosen ids (one query for all picks). `genres` is genre names sorted alphabetically, `[]` when there are none, and `posterPath` stays `string \| null`, to match `MovieCardMovie`. An `IN` read has no order, so the result is put back in the chosen order. A pick that is no longer listable at this read is dropped and the batch is one short, which is accepted (inside one snapshot this should not happen) |

**Scoring query shape** (the one decision the builder must not improvise; AC-3, AC-5, AC-13):

```
anchors    = MATERIALIZED: the loaded anchor ids joined to movie_embeddings (model = EMBEDDING_MODEL), each with its weight
candidates = movies m joined to movie_embeddings e (model = EMBEDDING_MODEL)
             where isListable() and unavailableMovies(userId, m.id, "feed") and m.id <> all(shown)
pairs      = candidates x anchors, product = weight * (1 - (e.embedding <=> a.embedding))
pos        = per candidate, the liked pair with the largest product: DISTINCT ON (candidate)
             ORDER BY candidate, product DESC, anchor id ASC. This row also names the anchor.
neg        = coalesce(greatest(0, max over the disliked pairs of abs(weight) * similarity), 0)
prior      = coalesce'd formula from AC-10
score      = pos.product - NEGATIVE_WEIGHT * neg + PRIOR_WEIGHT * prior
ORDER BY score DESC, movie id ASC   LIMIT CANDIDATE_FETCH
```

The scan stays exact. Never write `ORDER BY e.embedding <=> $vector LIMIT k` against `movie_embeddings`: the planner could pick the HNSW index, which is approximate and can lose rows after the filters (spec 0002). The anchors sit in a materialized CTE (a subquery computed once) so each anchor vector is read once and the large vectors are not read again for every candidate.

**Value sourcing** (every value the result needs, and where it comes from):

| Action | Value produced / displayed | Source |
|---|---|---|
| `recommendMovies` | The user id | The caller's `userId` input, read from the live session by feature 9 |
| `recommendMovies` | A rating's weight | `ratingWeight(ratings.score)`, constants in `weights.ts` |
| `recommendMovies` | Liked or disliked | `ratings.score >= 6` or `<= 5` |
| `recommendMovies` | The anchors | `ratings` joined to `movie_embeddings` where `model = EMBEDDING_MODEL`, capped 30 liked and 10 disliked |
| `recommendMovies` | Similarity | `1 - (candidate.embedding <=> anchor.embedding)` (pgvector cosine distance) |
| `recommendMovies` | `pos`, `neg`, and the anchor behind `pos` | Derived in `scoreCandidates` from the weights and similarities above |
| `recommendMovies` | `prior` | `movies.vote_average` and `movies.vote_count` with the AC-10 formula |
| `recommendMovies` | Which movies are candidates | `isListable()`, `unavailableMovies(userId, movies.id, "feed")`, `movies.id not in shown`, and an embedding for taste mode |
| `recommendMovies` | The variety cap | `max(MIN_VARIETY_CAP, ceil(limit / likedAnchorCount))` from the call's `limit` and the anchors loaded |
| `recommendMovies` | The anchor's title, year and score | `movies.title`, `movies.release_year` and `ratings.score` of the anchor |
| `recommendMovies` | Card fields and genres | `movies` columns and `movie_genres` joined to `genres` (names, alphabetical, `[]` when none), for the chosen ids only |
| `recommendMovies` | The anchor embeddings used in scoring | `movie_embeddings` joined inside the scoring query by anchor id, never sent through Node |
| `recommendMovies` | The order of the final list | Sorted by `score` descending then movie id ascending after the variety pass; `loadPickCards` restores that order |
| `recommendMovies` | Whether to use the popular fallback | `likedCount = 0` (AC-8) or taste mode returned no candidate (AC-18) |
| `recommendMovies` | `likedCount`, `dislikedCount` | Counts over the user's ratings with a current embedding, in SQL |
| `recommendMovies` | `strength` | `tasteStrength(likedCount)` |
| `recommendMovies` | Which embedding model counts | `EMBEDDING_MODEL` from `src/catalog/embedding/model.ts` |

**Key invariants**:
- A pick is never rated, skipped, not listable or already shown, in either mode.
- Every `similar_to_liked` pick has an anchor the user rated 6 or higher, so "because you rated X highly" is always true. A disliked movie is never shown as a reason.
- The same stored data and the same call always give the same order (scores are compared, then movie id).
- The recommender never writes, and never stores taste.
- Every read of one call shares one snapshot (a read only `REPEATABLE READ` transaction), so counts, anchors, scores and reasons always agree.
- Scores from different users or different weights are not comparable. A score only ranks within one call.

**Security model**: the function is called on the server only, with a user id the caller took from the live session. It reads that user's rating rows and public catalog rows, and nothing from any other user. There is no endpoint, so no new input from the browser. Ratings are personal taste data, so no log line, error message or event holds a score, a title or a movie id (root `AGENTS.md`). No compliance scope beyond the privacy work in scope feature 17. Feature 9's "load more" action must itself check the signed in user and validate with Zod before it calls this function.

**Configuration required**: none. Prerequisite: `pnpm embed:catalog` has run, because taste mode needs embeddings. With none, every user gets the popular fallback.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Happy path: a user who rated one action movie 9 and one comedy 2 gets the closest unrated action movie first, with the action movie as its anchor, and a movie near the comedy ranks below a neutral one, verifies **AC-3**, **AC-6**
- Happy path: vectors built in the test database from known directions give an exact expected order, tie broken by id, and a second call returns the same list, verifies **AC-1**, **AC-3**
- Happy path: swipe 8, swipe 2, manual 10 and import 1 ratings give weights of about +0.56, -0.78, +1 and -1, and the source does not change them, verifies **AC-4**
- Happy path: 35 liked and 15 disliked ratings use exactly the 30 and 10 strongest, and 40 dislikes of score 1 with 3 likes still leave the 3 likes as anchors, verifies **AC-5**
- Happy path: strength is `none` at 0 liked, `thin` at 1 and 4, `ok` at 5, and the counts ignore the anchor cap, verifies **AC-7**, **AC-9**
- Happy path: a user with no ratings, one with only dislikes, and one whose liked movies have no embedding all get the popular order with reason `popular`, including a movie that has no embedding, verifies **AC-8**, **AC-13**
- Happy path: with two candidates whose taste differs by less than 0.1, the better voted one wins; when the taste gap is larger than 0.1 the closer one wins whatever the votes, verifies **AC-10**
- Happy path: with `limit` 20 and 7 liked anchors the cap is 3, so an anchor whose lookalikes fill the top 20 is the reason for at most 3 picks while other anchors have candidates; with 2 liked anchors the cap is 10; with 1 liked anchor the cap is 20 and the batch fills; when the cap leaves slots, the second pass fills them in score order, and the final list is sorted by score then id, verifies **AC-1**, **AC-11**
- Happy path: the mode switch depends only on whether the usable liked count is above 0: the same data with 4 likes and with 5 likes plus one unrelated extra like uses the same ranking rules, and only `strength` differs, verifies **AC-9**
- Happy path: a user with likes but no embedded candidate movie gets the popular order with reason `popular`, and `strength` still reads the user's real value, verifies **AC-18**
- Happy path: the fallback puts movies with a null `vote_count` last, and a movie with a null `vote_average` or `vote_count` still gets a number as its score, verifies **AC-8**, **AC-10**
- Happy path: page 1, then page 2 with `shown` set to page 1's ids, then rate a movie and fetch page 3; no repeats and no rated movie appears, verifies **AC-2**, **AC-12**
- Happy path: rating a movie just before a call removes it from the result and changes the scores, with no stored row to refresh, verifies **AC-14**
- Failure case: `limit` 0, 51 and 2.5, an empty `userId`, 501 shown ids, a shown id of 0 and a shown id above `Number.MAX_SAFE_INTEGER` each return `invalid_input` and read nothing; a `shown` list with duplicates works the same as one without, verifies **AC-15**
- Failure case: a user with no disliked anchor has `neg` of 0, and a candidate with a negative cosine to a disliked anchor is not given a bonus, verifies **AC-3**
- Failure case: the database is unreachable, the function returns `db_unavailable` and does not throw; an empty catalog returns `picks: []` and the profile, verifies **AC-15**
- Failure case: a listable movie without a current embedding is absent in taste mode, and an embedding row for another model is ignored, verifies **AC-13**
- Failure case: a movie marked missing by the catalog (poster removed, embeddings deleted) is neither a candidate nor an anchor, verifies **AC-2**, **AC-5**
- Failure case: a call with 60 ratings and `limit` 50 runs the same number of queries as one with 5 ratings and `limit` 5, and every query runs inside one read only transaction at `REPEATABLE READ`, verifies **AC-17**, **AC-19**
- Auth/permission: two users with different ratings get different results from the same catalog, and one user's ratings never change the other's picks; a query capture shows every read of `ratings` and `swipe_skips` binds the given `userId`, verifies **AC-16**
- Auth/permission: a spy on `console` during a full run records no rating, title, score or movie id, verifies **AC-16**

## Build plan

Tracer Bullet (root `AGENTS.md`): the first slice is a thin thread through every layer, then each later slice thickens one strand. Tests are written by `/test` after the build (Beta workflow).

1. **Thread: one user, one ranked list.** Create `src/recommend/` with `weights.ts`, the types, `ratingWeight`, `loadTaste` (anchors with the 30 and 10 split), `scoreCandidates` (the SQL read with `pos`, `neg` and the anchor behind `pos`, the shared exclusions and the embedding join), `loadPickCards`, and `recommendMovies` for taste mode with a fixed default limit. Open the one read only `repeatable read` transaction (`db.transaction` options) and write the scoring query in the shape above, with the anchors in a materialized CTE. Check on the dev branch that Drizzle's raw `sql` with pgvector's `<=>` runs inside it, that the transaction options work through Neon's pooler, and that `EXPLAIN` shows no use of the HNSW index. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-13**, **AC-14**, **AC-19**
2. **Strength and the popular fallback.** Add `tasteStrength`, the counts in `loadTaste`, `popularCandidates` and the mode switch, return the taste summary, and fall back to the popular list when taste mode finds no candidate. Satisfies **AC-7**, **AC-8**, **AC-9**, **AC-18**
3. **Popularity nudge.** Add the `prior` term to `scoreCandidates`. Satisfies **AC-10**
4. **Variety cap.** Add `pickWithVariety` (pure, two passes, then a final sort by score and id) and use it in `recommendMovies` over the fetched candidates, with `likedAnchorCount` taken from the anchors loaded. Satisfies **AC-1**, **AC-11**
5. **Paging and input checks.** Add the Zod schema inside the function: `userId` as `z.string().min(1)`, `limit` as an integer from 1 to 50, `shown` as up to 500 positive integers no larger than `Number.MAX_SAFE_INTEGER` (duplicates allowed and removed), and return `invalid_input` when it fails. Satisfies **AC-12**, **AC-15** (input)
6. **Failure handling, privacy and cost.** Map database failures to `db_unavailable` with `toDbFailure` and rethrow anything else as a bug, return an empty list for an empty catalog, keep every log line free of rating content, and check the query count does not grow with `limit` or ratings. On the dev Neon branch with the full seeded catalog, run `EXPLAIN ANALYZE` on the scoring query and time one call for a user with 40 anchors, and note both in `verify.md`. Satisfies **AC-15**, **AC-16**, **AC-17**, **AC-19**

## Consequences

**Positive**:
- Every pick has a true, specific reason ("because you rated Heat highly"), which is the product promise.
- No migration, no new table and nothing to refresh, so it cannot go stale and needs no export or delete work.
- It handles mixed tastes: max pooling means a love for crime films and a love for animation each pull their own picks up, instead of averaging into a blur.
- The scoring constants sit in one file, and the order is deterministic, so a golden test pins any future tuning.
- It works from the first swipe: a user with one like gets taste picks, and a user with none gets popular ones, never an empty feed by design.

**Negative / tradeoffs**:
- The weights (0.5 for dislikes, 0.1 for popularity, the 5.5 midpoint) are reasoned guesses, not measured. There is no usage data yet, so the first picks may feel off until they are tuned.
- Embedding similarity is compressed (most pairs score between about 0.3 and 0.8), so a dislike penalty shifts many candidates about equally and separates them less than a like does.
- With a fixed midpoint of 5.5, a user who rates everything 6 to 8 (common for Letterboxd imports) has nearly all ratings as mild likes, so the strongest signal is lost until a centred option is revisited.
- Each call scans about 3,000 movies against up to 40 anchors, around 120,000 similarity checks. That is fine now, but it will need the HNSW index or a cache once the catalog grows tenfold.
- A movie without an embedding can never be recommended on taste. A new release can wait a day for the daily job to embed it.
- The popular fallback and the popularity nudge lean towards the mainstream, so early picks are familiar films.
- The nudge is relatively stronger for a user who only swipes: their strongest liked weight is about 0.56, so a 0.1 nudge counts for about twice as much as for someone who rates 10s. This is accepted and documented, not scaled.
- `strength` can go down when the catalog withdraws a rated movie, because that movie loses its embedding and stops counting as usable.
- A liked rating of 6 has a weight of only 0.11, so "because you rated X highly" overstates it. Feature 9 words the reason from `anchor.score`.
- Reasons only point at liked movies. A user cannot be told "we avoided X because you disliked Y".
- `shown` is capped at 500 ids. A very long scroll in one session must start again from a fresh list, which can bring back a movie the user scrolled past.

**Neutral**:
- Spec 0002's rule holds: taste and reasons are computed on read. A cache table is an additive change if profiling ever shows a problem.
- The feed in feature 9 owns the sentence wording, the thin banner and the empty state.
- Imported Letterboxd ratings (feature 11) count as anchors with no change here.

## Follow-up

- [ ] Feature 9 (feed) calls `recommendMovies`, turns `Reason` into the reason sentence, shows the early guesses note when `strength` is `thin` or `none`, handles an empty `picks`, and adds a "load more" Server Action that uses `getUserForAction()` and Zod before passing `shown`.
- [ ] Feature 14 (feed feedback): `not_interested` joins `unavailableMovies`, so it needs no change here. Decide whether `more_like_this` adds a positive anchor or a boost.
- [ ] Feature 11 (Letterboxd import): decide whether to centre ratings on the user's own average once imports exist. Today the fixed midpoint treats a generous rater's 7 as a mild like.
- [ ] Tune `NEGATIVE_WEIGHT`, `PRIOR_WEIGHT` and the anchor caps once real ratings exist, and add a small golden order test so a change is visible.
- [ ] If the catalog grows past about 30,000 movies, switch the scan to the HNSW index with `hnsw.iterative_scan = relaxed_order` (spec 0002), and re measure.
- [ ] Verify before building: the dev Neon branch has `vector` enabled, `pnpm embed:catalog` has filled embeddings for the seeded catalog, and the version of pgvector supports the `<=>` operator inside the cross join as written, and `db.transaction` accepts `accessMode: "read only"` and `isolationLevel: "repeatable read"` through Neon's pooler.
- [ ] Feature 9 words the reason from `anchor.score` ("because you loved X" for 9 and 10, "because you liked X" for 7 and 8, "because you rated X" for 6), so it never overstates a mild like.
- [ ] Try a similarity centred on a catalog baseline (similarity minus the average similarity) once real ratings exist, because raw cosine similarity has a floor of about 0.3 and a dislike therefore separates candidates only weakly.
- [ ] Revisit scaling `PRIOR_WEIGHT` by the user's strongest liked weight if swipe only users get too mainstream a feed.

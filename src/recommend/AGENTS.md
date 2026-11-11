# src/recommend

The taste recommender. It turns a user's ratings into a ranked list of movies they have not dealt with yet, and each pick names the liked movie it came from. It is a server function only, computed on every call, with nothing stored. The feed (scope feature 9) calls it and writes the sentences. Governing spec: [0007](../../docs/specs/0007-taste-profile-recommender/index.md), with [verify.md](../../docs/specs/0007-taste-profile-recommender/verify.md).

## Key files

| File                    | Owns                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recommend-movies.ts`   | `recommendMovies(db, input)`, the one entry point. Validates input with Zod, opens one transaction, picks taste or popular mode, returns picks with a reason and a taste summary |
| `load-taste.ts`         | The user's liked and disliked counts, and the capped anchors (30 liked, 10 disliked) as ids, weights, titles, years and scores. It never loads an embedding into Node            |
| `score-candidates.ts`   | The one scoring query. Every listable, available, embedded movie against the anchors, best first, at most 300 rows                                                               |
| `popular-candidates.ts` | The fallback: listable, available movies by vote count, nulls last                                                                                                               |
| `load-pick-cards.ts`    | Card fields and genre names for the chosen ids, in one query, put back in the chosen order                                                                                       |
| `rules.ts`              | Pure rules: `ratingWeight`, `isLikedScore`, `tasteStrength`, `varietyCap`, `pickWithVariety`                                                                                     |
| `weights.ts`            | Every tuning number, in one file                                                                                                                                                 |
| `types.ts`              | `Pick`, `Reason`, `TasteProfile`, `Recommendations` and the error types the feed imports                                                                                         |
| `pg-array.ts`           | Formats a number list as one Postgres array parameter                                                                                                                            |

## Commands

```bash
pnpm test src/recommend    # unit tests run anywhere; database tests need DATABASE_URL_TEST and skip without it
```

## Conventions

- Nothing about taste is stored. There is no table, column or migration. A rating saved just before a call changes that call.
- The caller passes the user id from the live session. This code never reads the request. The feed's "load more" action validates with Zod and checks the signed in user before it calls in.
- Expected failures return a typed result: `invalid_input` and `db_unavailable`. Any other error is a bug and is thrown again through `unexpectedDbError` (`src/db/failure.ts`), a clean error with only the error kind and the SQLSTATE. Never rethrow the raw error: Drizzle puts the query parameters (user id, movie ids, weights) in its message, and Next.js logs what a page or action throws. The internal functions take an `Executor`, return plain values, and let errors rise to the one `catch` in `recommendMovies`.
- All reads of one call run in one `read only` transaction at `REPEATABLE READ`, so counts, anchors, scores and reasons come from one snapshot. The number of queries does not grow with the limit or the number of ratings.
- The scan is exact on purpose. Never write `ORDER BY embedding <=> $vector LIMIT k` against `movie_embeddings`: the planner could pick the HNSW index, which is approximate and can lose rows after the filters. The anchors sit in a materialized CTE so each anchor vector is read once.
- Every tuning number lives in `weights.ts`, and `weights.test.ts` pins them. Change the spec and that test together.
- A reason only ever names a liked movie (a score of 6 or more). The feed words the sentence from `anchor.score`, so a mild 6 is not called a favorite.
- No log line, thrown message or error body holds a rating, a score, a title or a movie id.
- Needs `pnpm embed:catalog` to have run. With no embeddings, every user gets the popular fallback.

## Gotchas

- The database tests share one Neon test branch with every other test file, and the branch also holds other movies. The helpers are in `src/test-support/recommend-fixtures.ts`:
  - Each test file uses its own band of vector dimensions (band 0 for `score-candidates`, 1 for `recommend-movies`, 2 for the fallback test). A movie that needs no particular similarity gets a random vector.
  - Movies and their vectors go in with one transaction and the real text hash, and each test removes its movies afterwards.
  - Compare only the movies a test made. Never write rows that point at movies another file made (a skip on every movie blocked other files from deleting theirs).
  - A listable movie with no embedding can be given one by another file's embed sweep. When a test only needs "no embedding", use `removed: true`, which the sweep never touches.
- Taste mode returns the best 300 candidates before the variety pass, so on a branch with many movies a low scoring candidate may not appear at all.
- One call takes about 2.5 to 3 seconds at 3,000 movies from a laptop (about 700 ms inside Postgres). Revisit before heavy use: the spec follow up names the HNSW index or a cache.

## Related specs

- [0007 Taste profile and recommender](../../docs/specs/0007-taste-profile-recommender/index.md)
- [0002 Data model](../../docs/specs/0002-data-model/index.md), which says taste is computed on read
- [0003 Movie catalog](../../docs/specs/0003-movie-catalog/index.md), which owns the embeddings
- [0004 Design system and UI foundation](../../docs/specs/0004-design-system-ui-foundation/index.md), which owns the `MovieCardMovie` shape

_Drafted by /sync from the introducing change, worth a quick human pass._

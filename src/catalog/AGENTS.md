# Movie catalog

## Overview

Where movie facts come from and how they are stored, kept fresh, read and matched. About 3,000 movies are loaded from TMDB by a script, a daily Vercel cron keeps them current, and Voyage vectors are written for the ones the swipe deck and feed may show. Swipe, feed, import and search all read from here. Governing spec: [docs/specs/0003-movie-catalog/index.md](../../docs/specs/0003-movie-catalog/index.md).

## Key files

| File                                                                                                           | Owns                                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `tmdb/client.ts`, `tmdb/discover.ts`, `tmdb/schemas.ts`                                                        | TMDB calls (details with credits and alternative titles, discover, genres) and the Zod shapes of the answers |
| `http/request-json.ts`                                                                                         | The one retry helper TMDB and Voyage share: timeout, 3 tries, backoff, `Retry-After`, Zod parse              |
| `sync/map-details.ts`, `sync/eligibility.ts`                                                                   | Pure: TMDB details to our shape, and the rules for entering the catalog                                      |
| `sync/persist-movie.ts`                                                                                        | The one write path: a movie, titles, genres, people and credits in one transaction                           |
| `sync/locks.ts`                                                                                                | Advisory locks every movie write takes first                                                                 |
| `sync/mark-removed.ts`                                                                                         | Withdraws a movie TMDB no longer returns, keeping the row                                                    |
| `sync/sync-movie.ts`                                                                                           | Fetch, map, check, write for one movie (seed and cron both use it)                                           |
| `sync/seed-catalog.ts`, `sync/refresh.ts`, `sync/add-new-hits.ts`                                              | The seed, the daily refresh of the oldest rows, and new popular movies                                       |
| `sync/run-catalog-sync.ts`, `cron/handle-cron.ts`                                                              | The daily job and the body of `GET /api/cron/catalog` (`src/app/api/cron/catalog/route.ts` only wires env)   |
| `embedding/embed-movies.ts`, `embedding/embedding-text.ts`, `embedding/voyage-client.ts`, `embedding/model.ts` | Vectors: what text is embedded, the Voyage client, the model name and batch size                             |
| `match/match-movies.ts`, `match/choose-match.ts`, `normalize-title.ts`                                         | Title plus year to one catalog movie (used by the Letterboxd import)                                         |
| `read/get-movie.ts`                                                                                            | `getMovie` and `getMoviesByIds` for pages                                                                    |
| `listable.ts`, `images.ts`, `tmdb-attribution.tsx`                                                             | The shared listable rule, poster URLs, and the TMDB footer                                                   |

## Commands

```bash
pnpm catalog:seed [--target <n>] [--id <tmdbId>]   # needs DATABASE_URL_UNPOOLED and TMDB_API_TOKEN
pnpm embed:catalog                                 # needs DATABASE_URL_UNPOOLED and VOYAGE_API_KEY
pnpm test src/catalog                              # database tests skip without DATABASE_URL_TEST
```

Both scripts load `.env.local` and write to the database it names, so check which Neon branch that is first. They parse only the variables they need and do not import `src/env.ts`.

## Conventions

- Every function that can fail from TMDB, Voyage or the database returns `Result<T, E>` with a typed code. Database failures map through `toDbFailure` to `db_unavailable`. Expected outcomes (skipped, ambiguous, removed) are values, not errors.
- Side effects take their dependencies as arguments (`db`, `tmdb`, `voyage`, and optional `fetch`, `now`, `sleep`, `random`). Tests pass fakes. Do not read `process.env` here; the route passes `env` values in.
- Show a movie in the swipe deck or feed only through `isListable()` (still returned by TMDB and has a poster). Lists of movies a user already rated skip it so their history still works.
- Posters are hotlinked from TMDB through `posterUrl`, never copied. The TMDB footer and notice stay on every page (AC-14).
- Every movie write goes through `persistMovie` or `markMovieRemoved`. Both take `lockMovieWrite` first, in one transaction.
- Logs, summaries and error bodies carry counts and ids only. Never a token, a key, a URL with a key, a response body, or anything about ratings.
- Changing `EMBEDDING_MODEL` makes every stored vector stale, because rows are keyed by (movie, model). `embed:catalog` then re embeds the catalog.
- Cron limits live as named constants: `TIME_BUDGET_MS` (45 s), `EMBED_LIMIT` and `STALE_WARNING_DAYS` in `sync/run-catalog-sync.ts`, `REFRESH_LIMIT` in `sync/refresh.ts`, `NEW_HIT_LIMIT` in `sync/add-new-hits.ts`. The route allows 60 s, so no new work starts after 45 s.
- Tests tag each case with its acceptance criterion (`AC-N`) in the title. Shared fakes for TMDB and Voyage and the row cleanup helpers are in `src/test-support/catalog-fixtures.ts`.

## Gotchas

- Database test files run in parallel on one shared test branch. Global operations (embedding every listable movie, refreshing the oldest 100, deleting orphan people) can touch another file's rows. Give each test its own ids from `newTmdbId()` and clean up after, and keep assertions to the test's own movies.
- Database tests must use the Neon test branch through `DATABASE_URL_TEST`. The harness refuses a URL whose host matches the dev branch.
- `release_year` and `search` on `movies` are generated columns. Never write them.
- `deleteOrphanPeople` takes the all writes lock exclusively, so it waits for writes in flight. Do not call it inside a movie write.
- The Voyage free tier is rate limited (3 requests and 10K tokens per minute), so `embed:catalog` is slow until a payment method is added. It is safe to run in slices.
- The daily job runs refresh, then new hits, then embeds, all inside one 45 second budget. If refresh uses the whole budget, new hits and embedding wait for the next run. Watch the first real cron log line (`updated`, `stored`, `embedded`) before relying on it.
- `normalizeTitle` (spec 0002) strips every Unicode combining mark, which also removes Indic vowel signs from titles. Catalog loading and the Letterboxd match both use it, so change it only with `match-movies.test.ts` in view.
- Migrations: change `src/db/schema.ts`, run `pnpm db:generate`, and review the SQL. Never run `pnpm db:migrate` before checking which branch `.env.local` points at.

## Related specs

- [0003 Movie catalog](../../docs/specs/0003-movie-catalog/index.md), with [verify.md](../../docs/specs/0003-movie-catalog/verify.md) and [rationale.md](../../docs/specs/0003-movie-catalog/rationale.md)
- [0002 Data model](../../docs/specs/0002-data-model/index.md), which owns the tables this area writes

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._

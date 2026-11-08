# 0003. Movie catalog: about 3,000 movies from TMDB, loaded by script and kept fresh by a daily job

**Date**: 2026-11-08
**Status**: Proposed

## Summary

Moviz gets its movie facts (titles, years, overviews, genres, cast, posters) from TMDB, a free movie database with an API. A script you run from your machine loads the 3,000 best known movies once. A daily job on Vercel then refreshes the oldest rows, adds new hits, and marks any movie TMDB drops, so no row is kept longer than TMDB's six month limit. A matcher turns a title plus year (for example from a Letterboxd file) into one catalog movie, and refuses to guess when it is unsure. The tables already exist from spec 0002, so this adds only four small columns.

## Requirements

Seeded from scope feature 4 ("Movie catalog"). Its done when line is: a few thousand real movies with posters and metadata are queryable, and a title plus year can be matched to one catalog movie reliably.

**User stories**:
- As a film fan, I want the swipe deck and feed to show well known movies with real posters so that I recognize what I am rating.
- As a film fan importing from Letterboxd, I want my films matched to the right catalog movie so that my ratings land on the right film.
- As the builder, I want one repeatable script and one daily job so that the catalog loads and stays fresh without manual upkeep.
- As the builder, I want the TMDB terms (attribution, six month cache limit) met by design so that the data source stays available.

**Acceptance criteria** (the contract; each is independently checkable):
- **AC-1**: `pnpm catalog:seed` on an empty database stores 3,000 eligible movies, ranked by TMDB vote count, highest first. The `--target <n>` flag changes the number (default 3,000). An eligible movie is not adult, has a poster, an overview, a release date that is not in the future, and at least 500 votes. A movie failing any rule is skipped and the next one takes its place. The count is the stored movies where `source_missing_at` is null, and the run checks it before fetching any details, so a run already at its target makes no detail calls. If discover runs out first, the run exits with success and the summary reports the shortfall.
- **AC-2**: Running the seed again changes no row counts and creates no duplicates. A run stopped halfway finishes the job when run again. Every write for one movie happens in one transaction. A removed movie that discover returns again is re synced, and `source_missing_at` is cleared once TMDB returns it. `pnpm catalog:seed --id <tmdbId>` force syncs one movie: on success it rewrites the movie and clears the flag, on a TMDB 404 it marks the movie removed, and for a movie that fails the eligibility rules it reports why and leaves the row alone.
- **AC-3**: Every stored movie has a `primary` row in `movie_titles`. Its original title and every TMDB alternate title are stored too, deduplicated by normalized key (first kind wins in the order primary, original, alternate). All keys are built with `normalizeTitle`. A title whose key comes out empty is dropped. If the primary title has an empty key the movie falls back to its original title: that text becomes `movies.title`, its row has kind `primary`, and there is no separate `original` row. If the original title is empty too, the movie is skipped as ineligible (`empty_title`).
- **AC-4**: `matchMovies` takes title plus year rows and returns, per row, one of: a match, `ambiguous`, or `no_match`. A row matches when its normalized title equals any stored title key of a movie whose `source_missing_at` is null (a poster is not needed for matching) and the movie's release year is equal or one year off. An exact year beats a one year difference. If more than one movie still fits, a movie matched by its primary or original title beats one matched only by an alternate title. The result is `ambiguous` only if a tie remains after both tiebreaks, and nothing is guessed. A row with no year, or a title whose key is empty, is `no_match`. Duplicate rows in the input get the same answer as each other. The function returns a `Result` and maps connection failures to `db_unavailable`.
- **AC-5**: `matchMovies` resolves any number of rows in a fixed number of queries (not one query per row), so an import of several thousand rows stays fast.
- **AC-6**: `getMovie(id)` returns the movie with its genres, directors, and cast ordered by billing, and `getMoviesByIds` does the same for many ids, each in a fixed number of queries. An unknown id returns `movie_not_found` from `getMovie`. `getMoviesByIds` returns results in the order of the ids asked for and leaves unknown ids out. A removed movie is returned with `removed: true` and empty genre, director, and cast lists, so a user's own lists still render.
- **AC-7**: The shared `isListable` rule hides a movie from the deck and feed when `source_missing_at` is set or `poster_path` is null. Movies the user already rated stay readable in the user's own lists.
- **AC-8**: `pnpm embed:catalog` writes one vector per listable movie for the current model, with `dimensions = 1024` and the SHA 256 of the embedding text. It skips movies whose model and hash are unchanged, so a second run with no data changes makes no Voyage calls. If Voyage fails, batches already saved stay saved and the script exits with an error.
- **AC-9**: The embedding text for a movie is built by one pure function from stored data, using the exact recipe in *Feature design*, so the same data always gives the same text and hash.
- **AC-10**: The daily route `GET /api/cron/catalog`, called with the right bearer token, refreshes up to 100 movies, adds up to 20 new eligible hits, embeds new and changed movies, stops starting new work after 45 seconds, and returns a JSON `RunSummary` (shape in *Feature design*). A missing or wrong token gets `401`, and so does any call when `CRON_SECRET` is not set. If `TMDB_API_TOKEN` or `VOYAGE_API_KEY` is missing at run time the route returns `500` with `{ "error": "config_missing" }` and names no variable and no value.
- **AC-11**: Refresh picks movies where `source_missing_at` is null (listable or not), ordered by `fetched_at` ascending with nulls first, so the 100 oldest rows are refreshed first. Every refreshed movie gets `fetched_at` set to now. The summary reports `oldestAgeDays` over those same movies (removed movies are left out on purpose), and the run logs a warning when it passes 120 days, well inside TMDB's six month limit.
- **AC-12**: When a refresh gets "not found" from TMDB, or the movie turns out to be adult, the movie is kept and `source_missing_at` is set to now. Its TMDB content (overview, tagline, poster path, original title, runtime, language, popularity, votes), genres, credits, alternate titles, and embeddings are removed. Its title, release date, id, and primary title key stay, so a user's ratings and lists still work. A removed movie is never returned by `matchMovies`.
- **AC-13**: `posterUrl(posterPath, size)` returns the TMDB image address for the sizes `w185` (small), `w342` (card), and `w500` (detail), and returns null for a null path. `POSTER_DIMENSIONS` gives the matching width and height for each size (2:3 ratio), which `next/image` needs. Posters are never copied to our storage.
- **AC-14**: Every page shows the TMDB logo (alt text "TMDB") and the required notice ("This product uses the TMDB API but is not endorsed or certified by TMDB.") in a footer, with the logo smaller than the Moviz name, which the footer also shows.
- **AC-15**: Every TMDB and Voyage response is parsed with Zod. A response of the wrong shape is a typed error for that one movie and never a crash. A `429`, a `5xx`, a timeout, or a network error is tried 3 times in total with backoff of 500 ms times 2 to the power of the attempt plus jitter, honoring `Retry-After` capped at the time left in the budget or 10 seconds. Each TMDB call has a 10 second timeout and each Voyage call 20 seconds. A movie that still fails is counted and skipped, so one bad movie never stops a run. A `401` or `403` from TMDB aborts the run with `tmdb_unauthorized`; only a `404` means removal. Each run ends with a `RunSummary`.
- **AC-16**: API tokens never appear in logs, errors, or summaries. Logs and summaries carry counts and TMDB ids only.
- **AC-17**: The change ships as one Drizzle migration that is additive (new nullable columns and one unique index), applies cleanly to an empty Neon branch, and leaves the export and delete completeness test from spec 0002 passing, because no user table changes.
- **AC-18**: Two syncs of the same TMDB id running at once end with one movie and consistent child rows, and no deadlock or unique key error. Credits are deduplicated by (person, role): the lowest TMDB order is kept and character names are joined with " / ".
- **AC-19**: After any write of TMDB data: a movie whose poster is now null has its embeddings deleted; people with no credits left are deleted at the end of each seed and cron run; genres TMDB adds later are created by name; every empty string from TMDB is stored as null; and `updated_at` is set on every update. An embedding is written only if the movie is still listable at write time.

## Decision

**Chosen option**: Option 1: TMDB API, loaded by a local script and refreshed by a daily cron.

Use TMDB as the only movie data source, through a thin client of our own. Load the catalog with a resumable local seed script, keep it fresh with a daily Vercel cron that also removes content TMDB withdraws, and expose a small read and match library for later features.

**Implementation skills**: `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.claude/skills/drizzle-orm-patterns/`) · `neon-postgres` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.claude/skills/nextjs-app-router-patterns/`) · `typescript-advanced-types` (`wshobson/agents`, `.claude/skills/typescript-advanced-types/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`)

## Rationale

Reasoning, options, and references: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**

Spec 0002 already built the catalog tables. This feature changes only these, in one additive migration:

| Table | Change | Used for |
|---|---|---|
| `movies` | add `tagline` text (null) | embedding text |
| `movies` | add `vote_count` integer (null) | ranking, the 500 vote floor, finding new hits |
| `movies` | add `source_missing_at` timestamptz (null) | marks a movie TMDB no longer returns |
| `people` | add `tmdb_id` integer (null), unique | reuse one person row across movies |

How the existing tables are filled:
- `movie_external_ids`: one row per movie, `provider = 'tmdb'`, `external_id` = the TMDB id as text.
- `movie_titles`: kinds `primary` (TMDB `title`), `original` (TMDB `original_title`), `alternate` (each TMDB alternative title). Primary key is (`movie_id`, `title_normalized`), so when two titles share a key the first kind wins in the order primary, original, alternate.
- `genres`: matched by `name` (unique) to TMDB's genre list; `movie_genres` links them.
- `people` and `credits`: the top 10 cast by TMDB `order` (role `cast`, `billing_order` = that order, `character_name` = the character) and every crew member whose job is `Director` (role `director`).
- `movie_embeddings`: one row per movie and model, as spec 0002 defines.

**State transitions**

A movie is in one of two states:
- `listable`: `source_missing_at` is null and `poster_path` is not null.
- `removed`: `source_missing_at` is set (TMDB returned 404, or the movie turned out to be adult). The cron never touches a removed movie again. The ways back are the seed meeting the movie in discover, or `pnpm catalog:seed --id <tmdbId>`: either force syncs the movie and, on a successful TMDB response, rewrites it and clears `source_missing_at`.
- A movie that stops being listable only because its poster went null stays in the refresh rotation (it is not removed), so its data never passes the cache limit.

**Embedding text recipe** (one pure function, `buildEmbeddingText`; lines whose data is missing are left out entirely):

```
{title} ({release_year})
Genres: {genre names, comma separated, alphabetical}
Tagline: {tagline}
{overview}
Directed by: {director names, comma separated, billing order}
Starring: {top 5 cast names, comma separated, billing order}
```

Determinism rules: genre names are sorted by code point; lines are joined with `"\n"` and there is no trailing newline; the overview is trimmed; when the release year is missing the first line is the title alone. `text_hash` is the SHA 256 hex of this exact string. Voyage is called with input type `document`, 1024 output dimensions, and batches of up to 100 movies. Each batch is written in one transaction as `INSERT ... SELECT ... WHERE <listable> ON CONFLICT (movie_id, model) DO UPDATE`, so a vector is never written for a movie removed after it was selected.

**Surfaces** (no user facing routes; the only screen change is the footer)

| Surface | What it does | Auth |
|---|---|---|
| `pnpm catalog:seed` | Loads the catalog (see *Seed algorithm*). Flags: `--target <n>` (default 3,000) and `--id <tmdbId>` (force sync one movie). Run from your machine against a chosen Neon branch. | Local: needs `DATABASE_URL_UNPOOLED`, `TMDB_API_TOKEN` |
| `pnpm embed:catalog` | Embeds movies lacking a current vector. | Local: needs `DATABASE_URL_UNPOOLED`, `VOYAGE_API_KEY` |
| `GET /api/cron/catalog` | Daily refresh (see *Cron job*). Node.js runtime, `maxDuration = 60`. | `Authorization: Bearer ${CRON_SECRET}`, compared in constant time; fails closed if `CRON_SECRET` is unset |
| `getMovie`, `getMoviesByIds` | Read a movie with genres, directors, and cast. | Server only; no user needed (public data) |
| `matchMovies` | Batch title plus year matching. Used by Letterboxd import (feature 11). | Server only; callers pass already validated rows |
| `posterUrl` | Builds the poster address. | Pure function |
| `TmdbAttribution` | Server component: logo and notice, rendered in the root layout footer. | None |
| `isListable` | SQL fragment (`source_missing_at IS NULL AND poster_path IS NOT NULL`) that deck and feed queries embed beside `unavailableMovies`. | Server only |

**Seed algorithm** (`pnpm catalog:seed`, resumable)
1. Fetch TMDB's movie genre list and upsert it into `genres` by name.
2. Count stored movies where `source_missing_at` is null. If the count has reached the target (`--target`, default 3,000), stop before any detail call.
3. Page through TMDB discover: `sort_by=vote_count.desc`, `vote_count.gte=500`, `include_adult=false`, `include_video=false`, `language=en-US`, `primary_release_date.lte=<today UTC>`, page 1 up, until the target is reached or page 500 is passed. Pages are walked again on every run (up to about 150 calls), which is cheap.
4. For each id returned: if it is stored and not removed, count it and move on. If it is not stored, or it is stored as removed, fetch details with `append_to_response=credits,alternative_titles`, up to 5 at a time. Check eligibility on the details (discover cannot filter on poster or overview). Write the movie, titles, genres, people, credits, and external id in one transaction (see *Write path*), replacing that movie's child rows so a re run is safe. A restored movie clears `source_missing_at`.
5. With `--id <tmdbId>` the run skips steps 2 and 3 and syncs just that id.
6. Delete people with no credits (AC-19). Print the `RunSummary`. If discover ran out before the target, say so and exit with success.

**Write path** (`persistMovie`, shared by the seed and the cron)
1. Take `pg_advisory_xact_lock(hashtextextended('tmdb:' || <tmdb id>, 0))` first. It works through Neon's transaction pooling, as spec 0002's per movie lock does, and stops two runs from writing the same movie at once.
2. Upsert the movie by its external id; never write `release_year` or `search` (generated columns); set `updated_at = now()` and `fetched_at = now()`.
3. Upsert genres by name (`ON CONFLICT DO NOTHING`, sorted), then people sorted by `tmdb_id` (`ON CONFLICT (tmdb_id) DO UPDATE` on name and profile path), so concurrent writes cannot deadlock.
4. Replace the movie's titles, genre links, and credits. Credits are deduplicated by (person, role), keeping the lowest order and joining character names with " / ".
5. If the poster is now null, delete the movie's embeddings.

**Cron job** (`GET /api/cron/catalog`, daily, production only on the Hobby plan)
1. Refresh: pick up to 100 movies where `source_missing_at` is null (listable or not), ordered by `fetched_at` ascending with nulls first. Fetch details, rewrite through the write path, set `fetched_at`. A TMDB "not found", or an adult flag, marks the movie removed (AC-12). Vote and date floors are not applied to an existing movie.
2. Add new hits: three discover pages sorted by popularity with `vote_count.gte=500` and `primary_release_date` within the last 365 days; insert up to 20 movies not yet stored (no `movie_external_ids` row, removed ones included) that pass eligibility. The catalog may grow slowly past 3,000 this way.
3. Embed: new and changed movies, at most 100.
4. Delete people with no credits.
5. Stop starting new work after 45 seconds. Work is ordered by `fetched_at`, so the next run continues where this one stopped.
6. Return the `RunSummary` as JSON and log it as one line. Use the shared pooled `db` from `src/db/client`, with TMDB calls 5 at a time.

At 100 refreshes a day, 3,000 movies cycle in about 30 days.

**Matching** (`matchMovies`)
- Input: rows of `{ title, year }`. Output: `Result<MatchOutcome[]>` with one `{ kind: 'match', movieId } | { kind: 'ambiguous' } | { kind: 'no_match' }` per input row, in the same order, and `db_unavailable` on a connection failure. The reasons line up with spec 0002's import reasons (`no_match`, `ambiguous`).
- Implementation: normalize every title with `normalizeTitle`. A row with an empty key or no year is `no_match` and never reaches the query. Dedupe the (key, year) pairs, then one query joins them (`unnest` of the key and year arrays) to `movie_titles` and `movies`, restricted to movies where `source_missing_at` is null, and returns the title kind with each hit. Choose per pair in code: candidates with release year equal to the row year win; otherwise candidates one year off; among those left, a primary or original title match beats an alternate only match; one candidate means a match, more than one means `ambiguous`. Map the answers back to the input rows.

**Run summary** (`RunSummary`, a Zod schema in `src/catalog/sync/run-summary.ts`, returned by the cron and printed by the scripts): `{ stored, updated, removed, failed, embedded, oldestAgeDays, skipped: { adult, no_poster, no_overview, future_date, low_votes, empty_title, not_found, bad_shape } }`, all integers. `oldestAgeDays` is the age of the oldest `fetched_at` among movies where `source_missing_at` is null. The seed adds `shortfall` (target minus stored) and a list of TMDB ids that share a title key and year.

**Value sourcing**

| Action | Value produced or displayed | Source |
|---|---|---|
| Seed, cron | TMDB auth | `TMDB_API_TOKEN` (the TMDB "API Read Access Token", sent as a bearer token) |
| Seed, cron | `title`, `original_title`, `overview`, `tagline`, `runtime_minutes`, `original_language`, `popularity`, `vote_average`, `vote_count`, `poster_path` | TMDB details response, requested with `language=en-US` |
| Seed, cron | `release_date` | TMDB `release_date`; an empty string becomes null |
| Seed, cron | every other TMDB text field (`overview`, `tagline`, `original_title`, names, paths) | The TMDB value, with `""` stored as null by `mapDetails`; an empty overview then fails eligibility |
| Seed, cron | `updated_at` | `now()` set on every update; `release_year` and `search` are generated and never written |
| Seed, cron | `movies.title` when the primary title key is empty | TMDB `original_title` (AC-3) |
| Seed, cron | `title_normalized` on `movies` and `movie_titles` | `normalizeTitle(title)` (spec 0002) |
| Seed, cron | title kinds | `primary` = TMDB `title`; `original` = `original_title`; `alternate` = each entry of `alternative_titles.titles` |
| Seed, cron | genres | TMDB `genres[].name` matched to `genres.name` |
| Seed, cron | cast | `credits.cast` sorted by TMDB `order`, first 10; `billing_order` = `order`; `character_name` = `character` |
| Seed, cron | directors | `credits.crew` where `job = 'Director'`; `billing_order` = the director's index in TMDB's crew array (crew entries have no `order`) |
| Seed, cron | duplicate credits | Deduplicated by (person, role); lowest order kept; character names joined with " / " |
| Seed, cron | person identity | TMDB person id into `people.tmdb_id`; name and `profile_path` from the credit |
| Seed, cron | `fetched_at` | `now()` in the database at write time |
| Seed | candidate list | TMDB discover with the parameters in *Seed algorithm* |
| Seed | "today" for the release date filter | UTC date from the system clock, formatted `YYYY-MM-DD` |
| Seed, cron | eligibility | Rules in AC-1, applied by the pure `isEligible(details, today)` |
| Cron | which movies to refresh | `source_missing_at IS NULL`, `fetched_at` ascending with nulls first, limit 100 |
| Cron | "not yet stored" for new hits | No `movie_external_ids` row for the TMDB id (removed movies count as stored) |
| Cron | new hit window | discover with `primary_release_date.gte` = today minus 365 days |
| Cron | time budget | 45 seconds from the start of the request, checked before each new unit of work |
| Cron | removal | HTTP 404 from TMDB details, or `adult = true` in the response; `source_missing_at = now()` |
| Cron, seed | `RunSummary` | Counted by the run; `oldestAgeDays` = whole days since `min(fetched_at)` over movies where `source_missing_at IS NULL` |
| Cron | missing key at run time | `TMDB_API_TOKEN` or `VOYAGE_API_KEY` unset gives `500 { "error": "config_missing" }` |
| TMDB and Voyage calls | retry timing and timeouts | Rules in AC-15 (3 attempts, 500 ms times 2^attempt plus jitter, `Retry-After` capped, 10 s and 20 s timeouts) |
| Embed | `model` | constant `EMBEDDING_MODEL` in `src/catalog/embedding/model.ts` (a Voyage model with 1024 dimension output, verified at build) |
| Embed | `dimensions` | the response vector length; must equal 1024 or the movie fails |
| Embed | text and `text_hash` | `buildEmbeddingText(movie)` and its SHA 256 hex |
| Embed | which movies need work | listable movies with no `movie_embeddings` row for `EMBEDDING_MODEL`, or a row whose `text_hash` differs |
| `posterUrl` | base address | constant `https://image.tmdb.org/t/p/`, followed by the size and the stored `poster_path` |
| `posterUrl` | image width and height for `next/image` | `POSTER_DIMENSIONS` exported beside it: `w185` 185x278, `w342` 342x513, `w500` 500x750 (2:3) |
| `TmdbAttribution` | notice text, logo, and the name beside it | Constant text in the component; logo file from TMDB's brand assets, saved as `public/tmdb-logo.svg` with alt text "TMDB"; the footer also shows the text "Moviz" so the logo can be smaller than the name |
| `getMovie`, `getMoviesByIds` | `removed` flag | `source_missing_at IS NOT NULL` |
| `matchMovies` | title key | `normalizeTitle(row.title)` |
| `matchMovies` | year | the row's `year` input; null means `no_match` |
| Cron auth | the expected token | `CRON_SECRET` from `src/env.ts` |

**Key invariants**
- One movie per TMDB id (`movie_external_ids` primary key). The seed and cron never create a second row for an id they already hold.
- Every stored movie has a `primary` title row.
- A removed movie keeps its row and id, so no user row is orphaned (spec 0002 restrict rule), and it is never listable or matched.
- `fetched_at` is set on every successful write of TMDB data. No listable row is older than 180 days on a healthy catalog.
- Embeddings exist only for listable movies, one per movie and model, always 1024 dimensions.
- All writes for one movie happen in one transaction, under the per TMDB id advisory lock.
- Credits are unique per (movie, person, role); people are unique by `tmdb_id`.
- Spec 0002's "catalog sync marks nothing deleted" still holds: no movie row is ever deleted. `source_missing_at` marks a movie withdrawn without deleting it.
- Pure functions (`isEligible`, `mapDetails`, `buildEmbeddingText`, `posterUrl`, the match chooser) have no side effects. Network, database, and clock access stay in the sync, embed, and cron edges.
- Title keys are built only by `normalizeTitle`.

**Security model**
- Catalog data is public and holds no user data. No user input reaches TMDB; `matchMovies` only reads the database and uses bound parameters.
- Writes come only from the local scripts (using your database credentials) and the cron route (bearer token, constant time compare, fails closed).
- Tokens (`TMDB_API_TOKEN`, `VOYAGE_API_KEY`, `CRON_SECRET`) live in env vars and a gitignored `.env.local`, are read in the server only, and never appear in logs or summaries.
- No personal data is involved, so no compliance scope applies. TMDB's terms are a contract constraint and are handled in Consequences and Follow-up.

**Failure handling**
- TMDB `429`, `5xx`, timeout, or network error: 3 attempts in total with backoff (AC-15), then skip that movie and count it as failed. The run still finishes.
- TMDB `401` or `403`: abort the run with `tmdb_unauthorized`. A bad token must never look like thousands of per movie failures or be treated as a removal.
- TMDB `404` on refresh: mark removed (AC-12). A `404` during the seed means the id is skipped.
- Response of the wrong shape: a typed error for that movie, skipped and counted.
- Seed interrupted: re run to finish (AC-2).
- Voyage down: the seed still completes; `embed:catalog` can be re run; the cron leaves unembedded movies for the next run.
- Cron time budget reached: stop cleanly and return what was done.
- Two runs touching the same movie at once (a cron delivered twice, or the seed's parallel calls): the per TMDB id advisory lock makes the second wait, and people are written in `tmdb_id` order so they cannot deadlock (AC-18).
- Duplicate films (two TMDB ids for one film): the matcher returns `ambiguous` rather than guessing. The seed summary lists groups that share a title key and year so you can spot them.

**Configuration required**
- `TMDB_API_TOKEN`: TMDB API Read Access Token. Needs a free TMDB account and an API key request that states the personal, non commercial use. Added to `src/env.ts` as optional (required by the code that uses it) and to `.env.example`.
- `VOYAGE_API_KEY`: from spec 0001, used by `embed:catalog` and the cron.
- `CRON_SECRET`: from spec 0001, protects the cron route. Vercel sends it as the bearer token.
- `DATABASE_URL_UNPOOLED`: from spec 0002, used by both scripts.
- `vercel.json`: add `{ "crons": [{ "path": "/api/cron/catalog", "schedule": "0 5 * * *" }] }` to whatever the file already holds.
- Scripts run with `tsx --env-file=.env.local`. Each parses only the names it needs with its own small Zod schema and builds its pool with `createDb`; they do not import `src/env.ts`.
- Prerequisites: the TMDB account and token, the Voyage key, and the logo file downloaded from TMDB's brand assets.

**Code layout** (folder by feature)
- `src/catalog/tmdb/`: `client.ts` (fetch, retry, backoff), `schemas.ts` (Zod), `discover.ts`.
- `src/catalog/sync/`: `eligibility.ts`, `map-details.ts` (pure), `persist-movie.ts`, `sync-movie.ts`, `refresh.ts`, `add-new-hits.ts`, `run-summary.ts`.
- `src/catalog/embedding/`: `model.ts`, `embedding-text.ts` (pure), `voyage-client.ts`, `embed-movies.ts`.
- `src/catalog/match/match-movies.ts`; `src/catalog/read/get-movie.ts`; `src/catalog/listable.ts`; `src/catalog/images.ts` (`posterUrl`); `src/catalog/tmdb-attribution.tsx`.
- `scripts/catalog-seed.ts`, `scripts/embed-catalog.ts`; route in `src/app/api/cron/catalog/route.ts` (thin: auth, then calls `src/catalog/sync/`).
- TMDB test fixtures in `src/catalog/tmdb/__fixtures__/`.
- Posters are shown with `next/image` set to `unoptimized`, using TMDB's own `w185`, `w342`, and `w500` files and the width and height from `POSTER_DIMENSIONS`, so Vercel's image optimization quota is not used. `remotePatterns` is not needed for unoptimized images; add `image.tmdb.org` only as a safeguard.

**Critical test scenarios** (written afterwards by `/test`; TMDB is faked with fixtures and an injected `fetch`, database tests run on the Neon test branch)
- Happy path: seed against a fake TMDB of 12 movies with `--target 10` stores 10 eligible movies in vote order and skips those with no poster, adult flag, future date, or under 500 votes; a run already at target makes no detail calls; when discover runs out the summary reports the shortfall, verifies **AC-1**
- Happy path: running the seed twice leaves counts unchanged, and stopping it after 4 movies and re running completes it; a removed movie that discover returns again is restored; `--id` restores one, marks one removed on 404, and leaves an ineligible one alone, verifies **AC-2**
- Happy path: a movie with a primary, an original, and three alternate titles (one duplicating the primary after normalizing, one with an empty key) stores the expected `movie_titles` rows; a movie whose primary title has an empty key falls back to its original title as `movies.title` with kind `primary`, verifies **AC-3**
- Happy path: match "Heat" 1995 and a one year off row, an accented title, and an alternate title; each returns the right movie, and an exact year beats a one year difference, verifies **AC-4**
- Happy path: match 5,000 rows and count database queries; the count does not grow with rows, verifies **AC-5**
- Happy path: `getMovie` returns genres, directors, and cast in billing order; `getMoviesByIds` returns the same for many ids in input order and leaves out unknown ids; a removed movie comes back with `removed: true` and empty lists; an unknown id gives `movie_not_found`, verifies **AC-6**
- Happy path: `buildEmbeddingText` output matches the recipe, omits missing lines, and gives the same hash for the same data, verifies **AC-9**
- Happy path: `embed:catalog` writes 1024 dimension vectors, then a second run makes no Voyage calls, then changing an overview re embeds only that movie, verifies **AC-8**
- Happy path: the cron route refreshes the 100 oldest rows first (nulls first, including a movie whose poster is now null), adds new hits, sets `fetched_at`, and returns a `RunSummary` whose `oldestAgeDays` leaves out removed movies, verifies **AC-10**, **AC-11**
- Failure case: the cron route returns `500 config_missing` when a key is unset and the body names no variable, verifies **AC-10**
- Failure case: a refresh finds the poster now null (embeddings deleted), `adult` now true (marked removed), and a genre TMDB added later (created by name); empty strings are stored as null; people with no credits are deleted; `updated_at` moves, verifies **AC-12**, **AC-19**
- Failure case: two syncs of the same TMDB id at once end with one movie and consistent child rows and no unique key error or deadlock; duplicate cast and director entries are deduplicated, verifies **AC-18**
- Failure case: an embedding batch is written for a movie removed after selection; nothing is written for it, verifies **AC-19**
- Happy path: `posterUrl` returns the three sizes and null for a null path, verifies **AC-13**
- Happy path: the root layout renders the TMDB notice, the logo with alt text "TMDB", and the Moviz name; a Playwright axe scan of a page passes (CI does not run Playwright yet, so run it by hand until it does), verifies **AC-14**
- Failure case: two titles with the same key and year return `ambiguous`; a row with no year or an empty key returns `no_match`; a primary title match beats a foreign alternate title match in the same year; duplicate input rows get the same answer; a movie with no poster still matches; a removed movie never matches, verifies **AC-4**
- Failure case: TMDB `404` on refresh sets `source_missing_at`, clears TMDB content, genres, credits, and embeddings, keeps the title row and the user's rating, and the movie is no longer matched or listable, verifies **AC-7**, **AC-12**
- Failure case: TMDB returns `429` twice then succeeds on the third attempt (honors a capped `Retry-After`); a movie failing all 3 attempts with `500` is skipped and counted while the run finishes; a timeout counts as a failed attempt; a wrong shape response is skipped without a crash; a `401` aborts the run with `tmdb_unauthorized`, verifies **AC-15**
- Failure case: Voyage fails on the second batch; the first batch stays saved and the script exits with an error, verifies **AC-8**
- Failure case: the cron route stops starting new work after the time budget (fake clock) and still returns a summary, verifies **AC-10**
- Auth/permission: the cron route returns `401` with no token, a wrong token, and with `CRON_SECRET` unset, verifies **AC-10**
- Security: with a token value set, no log line or summary contains it, verifies **AC-16**
- Failure case: apply the migration to an empty branch; the export and delete completeness test still passes, verifies **AC-17**

## Build plan

Build approach: Tracer Bullet (from `AGENTS.md`). The thin thread first runs one movie from a fake TMDB response all the way to `getMovie`; later tasks thicken it into the full seed, the matcher, embeddings, the cron job, and the footer. One migration covers the whole feature. Tests are written by `/test` after the build (Beta workflow).

Built by `/develop movie catalog`:

1. Foundation: add `TMDB_API_TOKEN`, `VOYAGE_API_KEY`, and `CRON_SECRET` as optional names in `src/env.ts` and `.env.example`; add `tagline`, `vote_count`, `source_missing_at` to `movies` and `tmdb_id` (unique) to `people` in `src/db/schema/catalog.ts`; generate the Drizzle migration; add `isListable`. Satisfies **AC-7**, **AC-17**
2. Thin thread for one movie: the TMDB client with Zod schemas, retry, timeouts, and the 401/403 abort, pure `isEligible` and `mapDetails`, `persistMovie` (the write path: advisory lock, one transaction, genre and people upserts, credit dedupe, child row replacement, `updated_at`), `getMovie` and `getMoviesByIds` with their return types, `posterUrl` with `POSTER_DIMENSIONS`, and `RunSummary`, with TMDB fixtures. Prove it by syncing one fixture movie into the dev branch and reading it back. Satisfies **AC-3**, **AC-6**, **AC-13**, **AC-15**, **AC-16**, **AC-18**, **AC-19**
3. Full seed: genre upsert, discover paging, the target check before detail calls, bounded concurrency, resume and idempotency, restoring removed movies, `--target` and `--id`, orphan people cleanup, the run summary with the shortfall and duplicate title report, and `pnpm catalog:seed` with its own env schema. Run it once for real against your dev branch. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-15**, **AC-19**
4. Matcher: `matchMovies` with dedupe, the single query, the kind tiebreak, and the pure chooser. Satisfies **AC-4**, **AC-5**
5. Embeddings: `buildEmbeddingText`, `model.ts`, the Voyage client (Zod parsed, 20 second timeout, retry), `embedMovies` (guarded insert per batch, delete on null poster), and `pnpm embed:catalog`. Check the current Voyage model name and its 1024 dimension output first. Satisfies **AC-8**, **AC-9**, **AC-15**, **AC-16**, **AC-19**
6. Cron: `refresh` (nulls first, includes unlisted movies), `addNewHits`, removal handling (404 and adult), the time budget, the route with bearer auth and `config_missing`, orphan people cleanup, and the `vercel.json` entry. Satisfies **AC-10**, **AC-11**, **AC-12**, **AC-19**
7. Attribution footer: save the TMDB logo as `public/tmdb-logo.svg`, build `TmdbAttribution` with the alt text and the Moviz name, and add it to the root layout. Satisfies **AC-14**

Traceability: AC-16 is enforced across tasks 2, 3, 5, and 6 (no token in logs) and checked by one test. AC-7 and AC-17 are satisfied by task 1; AC-18 by task 2.

## Consequences

**Positive**:
- One source, one client, one load script. A person can rerun any step and get the same result.
- The matcher and the read library are ready for features 7, 8, 9, 11, and 12 without more catalog work.
- Refreshing the oldest rows every day keeps every row far inside TMDB's six month cache limit, and withdrawn content is removed.
- Embedding text and the movie text sit in the same database, so the recommender and search need no second system.

**Negative / tradeoffs**:
- TMDB's free licence is for non commercial use. Ads, billing, or any revenue would need a written agreement with TMDB (spec 0001 already flagged this). TMDB decides what counts as commercial.
- Moviz depends on TMDB staying available and on its terms staying as they are. The `movie_external_ids` table keeps ids provider neutral, so a switch is possible but is real work.
- The catalog is about 3,000 movies. A Letterboxd import will leave rows unmatched for films outside it; they are reported, not looked up (spec 0001).
- Title and release date of a removed movie are kept so user ratings still work. That keeps a small amount of TMDB data past the cache limit; this is a judgment call to revisit when TMDB's position is confirmed.
- Ranking by vote count favors older, widely seen films. Recent hits only enter through the cron's new hit rule, once they pass 500 votes.
- The TMDB rate limit and the exact field list were not verified. The client is built defensively (retry, backoff, Zod) for that reason.
- Posters hotlink TMDB's image host. If TMDB blocks or changes it, every poster breaks at once.
- The daily cron runs on production only (Hobby plan). Dev and preview branches get data only through the scripts.

**Neutral**:
- A new migration lands with this feature, so spec 0002's planned migration numbers shift by one. Numbers are not grouped by theme anyway.
- `unoptimized` posters mean no Next.js image processing. TMDB's own sizes are used instead.

## Follow-up

- [ ] Create the TMDB account and API key; state the personal, non commercial use. Ask TMDB in writing whether a free, ad free hobby app that is public counts as non commercial (spec 0001 flagged this) before launch.
- [ ] Verify before building: TMDB's current rate limit; that `append_to_response=credits,alternative_titles` works as described and what the alternative titles response looks like; the discover parameter names (`vote_count.gte`, `primary_release_date.lte`, `primary_release_date.gte`); the exact notice wording and logo rules on TMDB's brand and attribution page.
- [ ] Verify before building (Voyage): the current model name, that it supports 1024 dimension output, the batch limit, and the free allowance. Set a monthly spend cap in the Voyage dashboard.
- [ ] Verify: Vercel Hobby image optimization limits. `unoptimized` avoids them, but confirm that plain TMDB files are fast enough on phones.
- [ ] Spec 0002 (stale after this spec): update the slice coverage table for feature 4 with the additive columns here (`tagline`, `vote_count`, `source_missing_at`, `people.tmdb_id`); reword the invariant "catalog sync marks nothing deleted" to mention `source_missing_at`; and record that the duplicate movie merge procedure it asked of spec 4 is deferred (this spec only reports duplicates and returns `ambiguous`).
- [ ] CI does not run Playwright yet, so the footer's accessibility scan (AC-14) runs by hand until a CI job exists.
- [ ] Spec 7 (swipe onboarding): build the deck from `isListable` movies ordered by `vote_count`; this spec does not choose the deck.
- [ ] Spec 11 (Letterboxd import): call `matchMovies`; map `ambiguous` and `no_match` to the import reasons; Letterboxd's years can differ by one from TMDB, which the match rule allows.
- [ ] Spec 16 (where to watch): TMDB watch provider data may carry its own credit rule (JustWatch); confirm it before showing it.
- [ ] Spec 17 (privacy): the Voyage data processor line stays; list TMDB as a data source and put the TMDB notice in the About text.
- [ ] Create `src/catalog/AGENTS.md` once this feature is built (TMDB rules, six month cache, the seed and embed scripts).
- [ ] Decide later whether removed movies should also drop their title once TMDB's position on the cache limit is confirmed.
- [x] Scope row 4 links this spec and lists the milestones from the Build plan.

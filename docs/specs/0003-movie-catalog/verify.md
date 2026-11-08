# Verify: movie catalog · spec 0003 · updated 2026-11-08
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run the live steps against a Neon dev branch you chose, never production. Before anything else, apply the migration to that branch (`pnpm db:migrate`) and confirm the new columns exist.

_Run notes (2026-11-08, `/check verify`): run on a dev branch that already held migration 0000, not an empty one. Voyage had a 3 requests per minute limit, so embeds ran in slices. The full daily job ran in process with its clock scaled 10 times slower, because local database round trips take about 240 ms (the same job in a deployed region should fit the real 45 s). The cron route over HTTP was called twice and returned 200 with a summary after about 50 s. Constant time compare is by construction (SHA 256 digests plus `timingSafeEqual`); behavior was run with equal, shorter, longer, missing and blank tokens. The exhausted discover case ran in process with real TMDB and the dev database, with discover cut off after page 3: `--target 10000` ended with success, 0 stored, `shortfall: 9790` (10000 minus 210 stored); `--target 10001` and `5000000` are refused with the usage line._

## UI / manual
- [x] Open any page (for example `/`) → the footer shows "Moviz", the TMDB logo (alt text "TMDB") that is visibly smaller than the name, and the sentence "This product uses the TMDB API but is not endorsed or certified by TMDB." → AC-14
- [x] Tab through a page in light and dark mode → the footer text has enough contrast and nothing in it traps focus; run the axe scan by hand (`pnpm test:e2e`, CI does not run it yet) → AC-14 (checked 2026-11-08 with a one off axe script, WCAG 2 A, AA and 2.1 AA, 0 violations in both modes; no `e2e/` file exists yet, `/test` can add one)

## Commands
- [x] `pnpm db:migrate` on an empty Neon branch, then list the columns of `movies` and `people` → `tagline`, `vote_count`, `source_missing_at` and `people.tmdb_id` (unique) exist; nothing else changed; `pnpm test` still passes the export and delete completeness test → AC-17
- [x] `pnpm catalog:seed --target 20` on that branch → 20 movies stored, the summary shows `shortfall: 0`, every stored movie has a poster, an overview and at least 500 votes, and they are the 20 highest by vote count that pass the rules → AC-1
- [x] Run `pnpm catalog:seed --target 20` again → no new rows, and the summary shows `stored: 0` with no detail calls made (check with a count of movies before and after) → AC-1, AC-2
- [x] Start `pnpm catalog:seed --target 60`, press Ctrl+C after a few seconds, then run it again → it finishes with 60 movies and no duplicates → AC-2
- [x] `pnpm catalog:seed --target 5000000` is refused, and `--target 10000` with an exhausted discover ends with success and a `shortfall` number → AC-1
- [x] `pnpm catalog:seed --id <a stored tmdbId>` → the movie is rewritten and `source_missing_at` is null; `--id 1` (a TMDB id that does not exist) reports the movie as not found and writes nothing → AC-2
- [x] Pick one stored movie and look at its `movie_titles` rows → one `primary` row, an `original` row when it differs, alternates deduplicated by normalized key, no empty keys → AC-3
- [x] Call `matchMovies` with "Heat" 1995, "heat" 1996, "Heat" 2005, a row with no year and a row of only punctuation → the first two match the same movie, the last three are `no_match`; the exact year beats the one year difference → AC-4
- [x] Call `matchMovies` with several thousand rows while counting queries → the query count stays the same as for one row → AC-5
- [x] Call `getMovie` for a stored id, an unknown id, and a removed id; call `getMoviesByIds` with ids in a shuffled order plus one unknown id → genres alphabetical, cast in billing order, `movie_not_found` for the unknown id, results in the order asked with the unknown id left out, and `removed: true` with empty lists for the removed one → AC-6
- [x] `pnpm embed:catalog` → one 1024 dimension vector per listable movie, each with a `text_hash`; run it again → no Voyage call is made; edit one movie's overview in the database and run it a third time → only that movie is embedded again → AC-8, AC-9
- [x] Set a wrong `VOYAGE_API_KEY` and run `pnpm embed:catalog` on a database with unembedded movies → exit code 1, the output names no key, and batches already saved stay saved → AC-8, AC-16
- [x] `curl -i http://localhost:3000/api/cron/catalog` with no token, with a wrong token, and with `CRON_SECRET` unset → `401` each time → AC-10
- [x] Call the route with the right `Authorization: Bearer <CRON_SECRET>` and `TMDB_API_TOKEN` blank → `500` with the body `{"error":"config_missing"}` and no variable name → AC-10
- [x] Call the route with the right token and both keys set → `200` with a `RunSummary`; `fetched_at` moved on the 100 oldest rows (rows with a null `fetched_at` first); up to 20 new movies appear; `oldestAgeDays` is a number → AC-10, AC-11
- [x] Set one stored movie's TMDB id to one TMDB returns `404` for (or use a fake), run the route → the movie has `source_missing_at` set, no overview, poster, genres, credits or embeddings, keeps its title and release date, and `matchMovies` no longer returns it → AC-7, AC-12
- [x] Search the server log and the response bodies of all runs above for the TMDB token, the Voyage key and `CRON_SECRET` → none appears → AC-16
- [x] Run `pnpm catalog:seed --target 20` in two terminals at the same time → one row per movie, no unique key error, no deadlock → AC-18
- [x] After a refresh where a movie lost its poster → its embeddings are deleted, it stays in the refresh rotation, and it is hidden by `isListable` → AC-7, AC-19
- [x] After any seed or cron run → people with no credits are gone, `updated_at` moved on rewritten movies, and no text column holds an empty string → AC-19

## Value sourcing (one step per row of the spec's table)
- [x] TMDB auth: blank `TMDB_API_TOKEN` stops the seed with a clear message; a wrong token stops it with `tmdb_unauthorized` and is not counted as thousands of failed movies → AC-15
- [x] Movie text and numbers (`title`, `overview`, `tagline`, `runtime_minutes`, `original_language`, `popularity`, `vote_average`, `vote_count`, `poster_path`): compare one stored movie to TMDB's own page for it → every value matches the English response → AC-1, AC-3
- [x] `release_date`: a movie TMDB returns with an empty date is stored as null and skipped as ineligible → AC-1
- [x] Empty strings from TMDB are stored as null, so an empty overview fails eligibility → AC-1, AC-19
- [x] `title_normalized`: change the machine timezone and locale, run the seed → the same keys are stored (they come from `normalizeTitle`, not from the clock or locale) → AC-3
- [x] Genres: a genre TMDB adds after the first run is created by name on the next write; ids of existing genres do not change → AC-19
- [x] Cast and directors: a movie with the same person listed twice in cast stores one credit with the lowest order and the character names joined with " / "; directors come only from crew with job `Director` → AC-18
- [x] Person identity: the same actor in two movies is one `people` row with one `tmdb_id` → AC-18
- [x] "Today" for the release date rule: change the system clock to just before and just after UTC midnight and run with a movie released that UTC day → it is eligible on the release day and skipped as `future_date` the day before → AC-1
- [x] Which movies the cron refreshes: movies with `source_missing_at` set are never picked; movies with a null poster are picked → AC-11
- [x] "Not yet stored" for new hits: a removed movie that discover returns in the new hit window is not re added by the cron → AC-12
- [x] Time budget: make TMDB slow (or lower the budget in a test) → the route stops starting new work after 45 seconds and still returns a summary → AC-10
- [x] `fetched_at` comes from the database clock: it equals the database time of the write, not the app server's → AC-11
- [x] Embedding text and hash: change a movie's genre order or add trailing spaces to its overview → the text and hash stay the same → AC-9
- [x] `posterUrl`: `w185`, `w342`, `w500` give `https://image.tmdb.org/t/p/<size><path>`, and a null path gives null → AC-13
- [x] `removed` flag on reads: it is true exactly when `source_missing_at` is set → AC-6
- [x] Cron auth: the token is compared in constant time against `CRON_SECRET` from `src/env.ts` → AC-10

## Acceptance criteria coverage
- AC-1 … seed target, ranking, eligibility, shortfall · AC-2 … run again, resume, `--id` · AC-3 … titles · AC-4 … matcher rules · AC-5 … matcher query count · AC-6 … read functions · AC-7 … `isListable`, removed movies hidden · AC-8 … embed script · AC-9 … embedding text and hash · AC-10 … cron route, auth, config, budget · AC-11 … refresh order, `oldestAgeDays` · AC-12 … removal · AC-13 … `posterUrl` · AC-14 … footer · AC-15 … retries, timeouts, `tmdb_unauthorized` · AC-16 … no secrets in logs · AC-17 … migration · AC-18 … concurrent syncs, credit dedupe · AC-19 … after write rules

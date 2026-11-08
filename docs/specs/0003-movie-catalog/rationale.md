# 0003. Rationale: movie catalog

Decision record for [index.md](index.md). The build does not read this file.

## Context

> ⚠️ Premise note: The plan says "free with no billing", and TMDB's free licence is for non commercial use only. TMDB decides what counts as commercial, and ads, billing, sponsorship, or revenue of any kind need a separate written agreement. This spec treats a free, ad free, public hobby app as fitting the free licence, but that reading is not confirmed by TMDB. If paid plans ever return from the Deferred list, this source has to be revisited. The design keeps ids provider neutral so a switch is possible.

Moviz needs real movie facts for four features at once. The swipe deck needs recognizable movies with posters. The feed and recommender need genres, cast, and a text description for each movie. Letterboxd import needs a title plus year to resolve to exactly one movie. Mood search needs a text description to embed. Spec 0002 already built the tables for all of this and left the data source and loading to this spec.

The forces: one builder with no deadline, a free product, a database that must stay small enough for a free plan, and a source whose terms limit how long its data may be cached (six months) and require visible credit. The scope says "a few thousand" movies. Spec 0001 fixed the shape of the heavy work: embeddings from a local script, daily cron only on the Hobby plan, imports that never call the metadata API per row, so unmatched rows are reported, not looked up.

Not deciding means swipe, feed, import, and search each guess at their data, and the six month cache limit gets noticed only when it is already broken.

## Options considered

### Option 1: TMDB API, local seed script, daily cron refresh (chosen)

Use TMDB for every field. Load the top 3,000 movies by vote count with a script you run, then refresh the oldest rows daily and add new hits.

**Pros**:
- Only candidate with overviews, posters, cast, directors, genres, and alternate titles together.
- Free for a non commercial, ad free app, with a documented attribution rule.
- A daily refresh of the oldest rows keeps every row far inside the six month limit.
- Provider neutral ids in `movie_external_ids` keep a later switch possible.

**Cons**:
- Free licence covers non commercial use only; any revenue needs a written agreement.
- Requires the TMDB logo and notice in the UI and a refresh job to honor the cache limit.
- Rate limit and exact field list not verified.

### Option 2: IMDb datasets plus OMDb

Take titles, years, genres, and ratings from IMDb's downloadable files and fill gaps from OMDb.

**Pros**:
- Bulk files need no API calls at runtime.
- IMDb ids are what many other tools use.

**Cons**:
- IMDb's terms say personal and non commercial use, which a public site may breach.
- The files have no posters and no overviews. OMDb's poster API is for patrons only.
- Two sources to join and keep in step.

### Option 3: A committed snapshot of a dataset

Ship a one time export of the catalog in the repository and load it with a script.

**Pros**:
- Fully repeatable on any branch, no API at runtime.
- No refresh job.

**Cons**:
- Redistributing TMDB data in git likely breaks its caching and storage terms.
- Goes stale at once; new releases never appear.
- Licence wording is weakest of all options for a public repo.

### Option 4: TMDB plus IMDb ratings for ranking

Use TMDB for facts and IMDb's vote data to pick the top movies.

**Pros**:
- IMDb votes are a strong, stable measure of how well known a film is.

**Cons**:
- Needs a second source whose terms are weaker, and an id bridge between the two.
- TMDB's own vote count is good enough to pick well known films.

## Rationale

Option 1 fits the forces in Context. The scope needs posters, overviews, cast, and alternate titles for a few thousand movies, and TMDB is the only source checked that supplies all of them. IMDb's files lack posters and overviews and carry the weakest licence wording. OMDb's posters are patrons only. Letterboxd's own API is not open to hobby projects, so it is used only as the user's CSV import. TMDB's terms are a real cost, but a free, ad free hobby app is the case they describe as covered, and the design handles the two obligations that matter: visible credit (a footer on every page) and the six month cache limit (a daily job that refreshes the oldest rows, so no row is more than about a month old).

Several smaller calls follow from the same forces. Ranking by vote count rather than current popularity gives a stable deck of widely seen films instead of a list that changes weekly. A 500 vote floor drops obscure films whose popularity is a short spike. All languages are included because a film fan app that cannot rate Parasite or Seven Samurai would feel thin, and titles come back in English. Posters are hotlinked from TMDB's image host and only `poster_path` is stored, so there is nothing to host or purge, with `unoptimized` images used because TMDB already serves resized files and Vercel's image quota on the Hobby plan is not verified. The first load is a script you run, not a cron, because it takes 3,000 detail calls and you can watch it. A thin client of our own (fetch plus Zod) beats a library because only four endpoints are needed and Zod turns an upstream change into a clear error.

Decisions made on the engineer's behalf: 100 refreshes and 20 new hits per cron run, because 100 calls fits a 45 second budget inside the 60 second limit and cycles 3,000 movies in about 30 days; new hits found by popularity within the last year, so recent films enter once they pass the vote floor; concurrency of 5 for TMDB calls, as a polite starting point until the real rate limit is checked; `isListable` requiring a poster, so a card never shows a blank image; scripts using the unpooled connection and their own small env schema, so they never need auth secrets; and no lock around the cron, since idempotent writes make an overlap harmless. The runner up for ranking was TMDB plus IMDb votes (Option 4), set aside because it adds a weaker source for a small gain.

The engineer's choice to clear a removed movie's TMDB content but keep its title and date balances two forces: TMDB asks that cached data be purged, and a user's ratings must stay readable. Keeping the title is a judgment call recorded in Consequences.

## References

**Project sources**:
- `AGENTS.md`, spec 0001, spec 0002, `src/db/schema/catalog.ts`, `src/catalog/normalize-title.ts`
- `docs/.agent-cache/research/moviz-stack-landscape.md` (TMDB terms check)

**Practices & standards**:
- Idempotent upserts, resumable jobs, validate external responses at the edge

**Links** (web verified in this session):
- TMDB API terms of use: https://www.themoviedb.org/api-terms-of-use
- TMDB daily ID exports: https://developer.themoviedb.org/docs/daily-id-exports
- TMDB image basics: https://developer.themoviedb.org/docs/image-basics
- OMDb API: https://www.omdbapi.com/
- IMDb non commercial datasets: https://data.imdb.com/non-commercial-datasets/
- MovieLens datasets: https://grouplens.org/datasets/movielens/latest/

## Evidence: data source check (2026-11-08)

Run once in a read only subagent. Items marked unverified were not opened.

| Source | Terms for a free, ad free app | Fields | Notes |
|---|---|---|---|
| TMDB API | Non commercial licence only; attribution (logo plus notice); cache at most 6 months | Title, original title, release date, overview, runtime, genres, credits, popularity, alternate titles (field list per docs, unverified) | Daily ID export files exist (IDs only). Rate limit not stated on the terms page. |
| TMDB images | Terms silent on hotlinking; stored copies fall under the 6 month rule | `w185`, `w342`, `w500`, original (sizes per image basics page) | Sizes list not fully shown. |
| OMDb | Content CC BY NC 4.0; free keys | Plot, ratings | Poster API is patrons only. Daily limit unverified. |
| IMDb datasets | Personal and non commercial use only | Basics, ratings, principals | No posters or overviews. |
| Wikidata | Not opened | IMDb id property confirmed in search | Coverage unverified. |
| MovieLens `links.csv` | Licence unclear for a public app | movieId, imdbId, tmdbId | Ids only. |
| Letterboxd API | Access by request; hobby and recommendation projects excluded per search snippet | Not verified | Used only as a user's CSV import. |

# 0013. Where to watch: rationale

## Context

Scope feature 16 asks which streaming services carry a movie in the user's country, with the data source credited as required. Moviz already depends on TMDB for every movie fact, and TMDB offers watch provider data per country, sourced from JustWatch, under a rule that JustWatch is credited wherever the data appears. The catalog holds about 3,000 movies, but a user only ever opens a handful of movie pages per visit.

Availability changes daily as services add and drop titles, so stored data goes stale. Calling TMDB on every page view would add latency and depend on TMDB being up for every view. The daily cron already runs close to its 45 second budget, so loading availability for the whole catalog every day would push other work out.

Country is the other input. Spec 0002 already designed it: a country from Vercel's IP header (source `ip`) that never overwrites one the user picked (source `user`). Nothing writes it yet. VPN users and travellers need a way to fix it. The engineer chose to show services on the movie page only for now.

## Options considered

### Option 1: Live call on every view, no storage

Call TMDB each time the section renders.

**Pros**:
- Always current; no table, no migration.

**Cons**:
- Every view waits for TMDB and fails when TMDB does.
- Repeats the same call for the same movie all day.

### Option 2: On demand fetch with a 24 hour cache table (chosen)

Fetch when a page needs a movie whose cached row is missing or older than a day; keep all countries in one row; show a row up to a week old when TMDB fails.

**Pros**:
- Most views read one row; only opened movies are ever fetched.
- A TMDB outage shows yesterday's data instead of an error.

**Cons**:
- The first view each day for a movie waits for TMDB.
- One more table and a staleness rule to test.

### Option 3: Daily sync for the whole catalog

Add a cron step that refreshes availability for every listable movie.

**Pros**:
- Every page view is a fast read; feed cards could use the data too.

**Cons**:
- About 3,000 TMDB calls a day, most for movies nobody opens, and the cron budget cannot hold them without a second job.
- More moving parts for a feature the engineer scoped to the movie page.

## Rationale

Option 2 fits the real traffic: a few opened movies per user, not the whole catalog. It keeps TMDB off the path of most views, survives TMDB outages gracefully, and needs no cron work, which matters because the cron budget is already tight. Storing all countries from one call in one row avoids a half updated state where one country is fresh and another is not.

Option 3 is the right shape if feed cards ever show services, because a feed batch needs data for 20 or more movies at once and cannot wait on 20 calls. That is why feed cards moved to Deferred rather than being dropped: the table here can be filled by a sync step later without changing its shape. Option 1 is simpler but makes a TMDB hiccup visible on every page.

Saving the IP country on the movie page read gives spec 0002's country rule its first writer in the one place that needs it. The picker lives in the section because that is where a wrong country is noticed.

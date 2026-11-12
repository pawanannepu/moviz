# Verify: Where to watch · spec 0013 · updated 2026-11-12
_Steps derived from spec 0013 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Before you start: apply migration `0006_watch_availability` (`pnpm db:migrate`, after checking which branch `.env.local` points to). Locally there is no `x-vercel-ip-country` header, so send one with a browser extension or a proxy when a step needs it.

## UI / manual
- [x] Open `/movie/<id>` for a movie with offers in your country → an `h2` "Where to watch" sits after the synopsis and before "Directed by"; the rest of the page shows before the section, which has its own skeleton → AC-1
- [x] Same movie → groups show in the order Stream, Free, Rent, Buy, only the ones with services; each service has a logo (empty alt) and its name as text; no service is a link; no group has more than 8 → AC-2
- [x] A movie TMDB lists in both `free` and `ads` for one service → that service shows once, under Free → AC-2
- [x] A movie with offers → the section ends with "See all options on TMDB", which opens the TMDB watch page in the same tab → AC-3
- [x] A movie with no offers in your country → "Not found on streaming in {country}." and no TMDB link → AC-3
- [x] Every state that shows TMDB data, the empty state too → "Streaming data from JustWatch" with JustWatch linked to `https://www.justwatch.com`; the site footer is unchanged → AC-4
- [x] New user, no stored country, header `x-vercel-ip-country: fr` → section shows "In France"; `profiles.country = 'FR'`, `country_source = 'ip'` → AC-5
- [x] Header `T1` or `XX`, no stored country → "Choose your country to see where to watch." with the picker open, no offers → AC-5
- [x] Stored country `FR` (source `user`), header `US` → still "In France", the profile row is unchanged → AC-5
- [x] Keyboard only: Tab to "Change country", press Enter → the "Country" select appears with every country named in English, sorted by name, plus Save and Cancel → AC-6
- [x] Choose Germany and Save → the section shows Germany's offers after the refresh, and focus is on "In Germany" → AC-6
- [x] Open the picker, press Escape (then try Cancel) → the picker closes and focus is back on "Change country" → AC-6
- [ ] With the database unreachable during Save → "Could not save your country. Try again." beside Save, focus still on Save → AC-10
- [x] Sign out in another tab, then Save → "Your session ended." with a "Sign in again" link → AC-10
- [ ] Open `/design#where-to-watch` → offers, empty, no country, could not load and loading all render, with `h4` and `h5` headings → AC-1, AC-12
- [x] At 320px wide, every state → no sideways scroll, the select fits → AC-12
- [ ] axe on the movie page and on `/design#where-to-watch`, at 320px and 1280px → no violations; each group is a list labelled by its own heading → AC-12

## Commands
- [x] `select movie_id, fetched_at from watch_availability where movie_id = <id>` after the first open → one row, `fetched_at` about now → AC-7
- [x] Open the same movie again within 24 hours → no TMDB call (watch the server's network or set a breakpoint), `fetched_at` unchanged → AC-7
- [x] `update watch_availability set fetched_at = now() - interval '25 hours' where movie_id = <id>`, then open → one TMDB call, `fetched_at` moves to now → AC-7
- [x] A movie whose TMDB id TMDB answers with 404 → a row with `regions = '{}'`, the empty state, and no call again for a day → AC-7
- [x] Unset `TMDB_API_TOKEN`, set the row 3 days old → the stored offers show with no warning → AC-8
- [x] Unset `TMDB_API_TOKEN`, set the row 9 days old (or delete it) → "Could not load streaming services right now.", no offers, no credit, and the rest of the page is fine → AC-8
- [x] A movie with no `movie_external_ids` row for `tmdb` → the empty state, no TMDB call → AC-9
- [ ] Call `setCountryAction({ country: "us" })` signed in → `{ ok: true, value: { country: "US" } }`, profile source `user`; `{ country: "XX" }` and `{ country: 5 }` → `invalid_input`; signed out → `unauthenticated` → AC-10
- [x] Delete a movie → its `watch_availability` row goes with it (cascade); the data export holds no `watch_availability` → AC-11
- [x] `grep` the server logs during the steps above → no country, movie id or title next to a user id → AC-11
- [ ] `pnpm watch:regions` → "To add: none" and "To remove: none" (the checked in `WATCH_REGIONS` matches TMDB) → AC-6

## Value sourcing (one step per source)
- [ ] User: open the page signed out → sign in first (`requireUser`) → Movie page user
- [x] Country: vary the stored country and the header (none, `ip`, `user`, an invalid code) → the order profile, header, none holds → Movie page country
- [x] Country name: `ES`, `XK`, `CI` → "Spain", "Kosovo", "Côte d’Ivoire" from `Intl.DisplayNames` → Section country name
- [ ] TMDB id: change the movie's `tmdb` external id to another movie, let the row expire → the other movie's services show → Section TMDB id
- [ ] Fresh or stale: rows 23h, 25h, 6d and 8d old with TMDB failing → fresh, refetch, stale shown, unavailable → Section fresh or stale
- [x] Groups: a stored region whose offers are shuffled → shown in priority then name order → Section groups
- [x] Logo URL: a logo with a path → `https://image.tmdb.org/t/p/w92/...`; with none → a plain square → Section logo URL
- [x] TMDB link: a region with `link: null` → no "See all options" line → Section link
- [x] JustWatch credit: the copy and URL come from `src/watch/constants.ts` → Section credit
- [x] Picker countries: the options equal `WATCH_REGIONS` → Picker countries
- [ ] Action user: a request with another user's id in the body → only the session user's profile changes → `setCountryAction` user
- [x] Action country: ` fr ` saves `FR` → `setCountryAction` country

## Acceptance-criteria coverage
- AC-1: movie page placement, `/design` · AC-2: groups, free and ads merge · AC-3: TMDB link, empty state · AC-4: credit · AC-5: IP header, invalid codes, user choice kept · AC-6: picker, focus, Escape, `watch:regions` · AC-7: fresh, expired, 404 rows · AC-8: stale and unavailable · AC-9: no TMDB id · AC-10: action results, error lines · AC-11: cascade, export, logs · AC-12: axe, 320px, labelled lists

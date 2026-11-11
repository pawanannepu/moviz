# Verify: Movie detail page · spec 0010 · updated 2026-11-11

_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

You need a signed in user who finished onboarding, a catalog with posters, and embeddings on the database the app uses (`pnpm embed:catalog`). "The feed" means `/home`.

## UI / manual

- [ ] Signed out, open `/movie/412` → you land on sign in, and the decoded `returnTo` is `/movie/412` → AC-1
- [ ] Sign in as a user who has not finished onboarding, open any movie page → the page shows, with no redirect to `/onboarding` → AC-1
- [ ] Signed in, open `/movie/0`, `/movie/012`, `/movie/12a`, `/movie/1.5` and `/movie/-3` → each shows "Movie not found" and the response status is 404 → AC-2
- [ ] With a stale or deleted session cookie, open `/movie/abc` → you land on sign in (with `returnTo=/home`), not on a 404 → AC-2
- [ ] Open `/movie/999999999999999` (no such movie) → the header, the title "Movie not found", the body "This movie is not in Moviz. It may have been removed.", and a "Back to picks" link that goes to `/home` → AC-3
- [ ] Mark a movie removed (`source_missing_at` set) on a test database and open its page → the same not found page → AC-3
- [ ] Open a movie that has no poster → the page shows with the dark title frame, not the not found page → AC-3
- [ ] Open a movie from the feed and read the page top to bottom → "Back to picks", poster, reason bar, title, meta line, tagline, synopsis, "Directed by", cast, in that order → AC-4
- [ ] Open a movie with no tagline, no runtime or no director → that part is simply absent, with no gap, placeholder or empty "Cast" heading → AC-4
- [ ] Check the poster → it loads from `image.tmdb.org/t/p/w500/...` and its alt text is "Poster for {title}" → AC-4
- [ ] Compare the meta line with the database row for three movies (170, 120 and 45 minutes if you can find them) → "2h 50m", "2h", "45m", after the year and before every genre in alphabetical order, joined by ", " → AC-5
- [ ] Open a movie with one, two and three directors → "Directed by A", "Directed by A and B", "Directed by A, B, and C", in billing order → AC-6
- [ ] Open a movie with more than 8 cast rows → exactly the first 8 by billing order, each "Name as Character", or the name alone when the character is blank → AC-6
- [ ] Note the reason on five feed cards, open each one → the page shows the same sentence, word for word, on the poster → AC-7, AC-8
- [ ] Open the page of a movie you rated, and one you skipped in onboarding → the movie shows with no reason bar and no text in its place → AC-7, AC-8
- [ ] As a user with no liked rating, open a movie from the feed → "Popular with film fans" → AC-7
- [ ] Rate a new movie 10 (straight in the database), reload a movie page close to it → the reason now names the new movie, which shows it is worked out on each view → AC-7
- [ ] Scroll a movie page with the reason below the fold, with motion allowed → the bar is already there and never wipes in → AC-8
- [ ] Make `reasonFor` fail while the movie read works (for example block the second connection, or stub it in a test) → the movie shows with no bar and no error; a refresh tries again → AC-9
- [ ] Throttle the network and open a movie → the header, "Back to picks" and a skeleton in the shape of the page show first; a screen reader hears "Loading movie" → AC-10
- [ ] Stop the database and open a movie → "We couldn't load this movie." and "Check your connection and try again.", with the header and back link still there; "Try again" loads the page once the database is back, and a second press while it runs does nothing → AC-10
- [ ] Resize from 320px to 1280px → one column under 1024px with a poster at most 420px wide, two columns from 1024px, never a sideways scroll, and a very long title wraps → AC-11
- [ ] On the feed, hover and Tab to a card → the whole card is clickable, the title is the link with the focus ring, Enter opens it; in the Network tab, scrolling the feed sends no request for any `/movie/...` page → AC-12
- [ ] Press "Load more picks" twice, open a card from the third batch, press the browser back button → the same 72 picks in the same order, that card in view with focus on its link, and no new request for `/home` or the Load more action → AC-13
- [ ] Leave the feed while "Load more picks" is still loading, then come back → the button is ready to press, not stuck → AC-13
- [ ] After a restore, check DevTools Application → `localStorage`, `sessionStorage` and the cookies hold nothing about picks, and the address has no query → AC-14
- [ ] Reload `/home` after a restore → 24 picks again. Sign out and sign in as another user → that user never sees the first user's list → AC-14
- [ ] Load more, import ratings that change the first 24 picks, return to `/home` → fresh picks, not the kept list → AC-14
- [ ] Open a card, press "Back to picks" → you go back one history step (the forward button leads to the movie again) and the feed is where you left it → AC-15
- [ ] Open a movie by typing its address, press "Back to picks" → a normal navigation to `/home`. Same after: feed, movie, Import, browser back to the movie, "Back to picks" (and the kept list still shows) → AC-14, AC-15
- [ ] Open a card in a new tab, then in the first tab type that movie's address and press "Back to picks" → a normal navigation, because a new tab never marks the card as opened → AC-12, AC-15
- [ ] Read the server log while opening movie pages, including a forced error → no rating, score, reason sentence, anchor title, user id or movie id in any line → AC-16
- [ ] Tab through the found page, the not found page and the error state → skip link first, then header, then "Back to picks"; every target is at least 44px high with the focus ring; exactly one `h1` in each state; the cast is a list → AC-18
- [ ] Check the tab title → "{title} ({year}) · Moviz", no parentheses when the year is null, "Movie not found · Moviz" for a bad, unknown or removed id; the page source has `noindex, nofollow` → AC-19
- [ ] Open `/design`, section "Movie detail" → with a reason, without, no poster, a long title with missing facts, the loading skeleton and the not found state all show → AC-20

## Commands

- [ ] `pnpm test src/recommend/reason-for.test.ts` → 16 pass (needs `DATABASE_URL_TEST`): the anchor is the largest weight times similarity, ties go to the lower id, it matches `recommendMovies`, rated, skipped, no poster, removed and unknown ids give null, four reads in one read only `REPEATABLE READ` transaction → AC-7, AC-16, AC-17
- [ ] `pnpm exec playwright test -c playwright.auth.config.ts e2e/auth/movie.spec.ts` → 10 pass: guards, 404s, the same reason on card and page, both layouts, axe scans, restore with focus, "Back to picks", the `/design` states → AC-1 to AC-4, AC-7, AC-8, AC-11 to AC-15, AC-18 to AC-20
- [ ] `pnpm exec playwright test -c playwright.auth.config.ts e2e/auth/feed.spec.ts` → 10 pass: the feed still works now that cards are links → AC-12
- [ ] `pnpm test src/feed src/ui "src/app"` → all pass, including the motion budget and `design.md` checks → AC-18, AC-20
- [ ] `EXPLAIN` the anchor read of `reasonFor` on the dev branch → sequential scans and a top N sort, and no `movie_embeddings_embedding_hnsw_idx` → AC-17
- [ ] Count the statements of one page view on a logging connection, for a user with 3 ratings and one with 300 → the same count, at most 7 reads after the session read, and one `movies` read although the title and the body both need the movie → AC-17
- [ ] `grep -n "movie" src/auth/public-paths.ts` → no match: the page is not public → AC-1
- [ ] `pnpm typecheck && pnpm check && pnpm build` → all clean → all

## Acceptance-criteria coverage

- AC-1 guards · steps 1, 2 and the `public-paths` command
- AC-2 id check and order · steps 3, 4
- AC-3 not found · steps 5, 6, 7
- AC-4 content and order · steps 8, 9, 10
- AC-5 meta line · step 11
- AC-6 director and cast · steps 12, 13
- AC-7 the reason rule · steps 14 to 17 and `reason-for.test.ts`
- AC-8 the bar · steps 14, 15, 18
- AC-9 reason failure · step 19 (not yet exercised by an automated check)
- AC-10 loading and error · steps 20, 21 (not yet exercised by an automated check)
- AC-11 layout · step 22
- AC-12 card links · steps 23, 31
- AC-13 feed keeps its place · steps 24, 25
- AC-14 memory only · steps 26, 27, 28, 30
- AC-15 "Back to picks" · steps 29, 30, 31
- AC-16 privacy · step 32 and `reason-for.test.ts`
- AC-17 cost · the `reason-for.test.ts`, `EXPLAIN` and statement count commands
- AC-18 accessibility · step 33 and the axe scans in `movie.spec.ts`
- AC-19 page title · step 34
- AC-20 design record · step 35 and the `/design` check in `movie.spec.ts`

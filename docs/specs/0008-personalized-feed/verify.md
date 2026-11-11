# Verify: personalized feed with reasons · spec 0008 · updated 2026-11-11
_Steps derived from spec 0008 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Needs a database with a listable catalog. The "early picks" and named reasons need `pnpm embed:catalog` to have run on it.

## UI / manual
- [x] Signed out, open `/home` → redirected to `/sign-in?returnTo=%2Fhome`   → AC-1
- [x] Signed in but not finished onboarding, open `/home` → redirected to `/onboarding`   → AC-1
- [x] Finished user with no ratings opens `/home` → header, "Your picks" h1 and the line "These are popular films while Moviz learns your taste." show, then up to 24 cards, each reason "Popular with film fans"   → AC-2, AC-3, AC-4, AC-5
- [x] Finished user with 3 liked ratings (score 9) opens `/home` → line "Early picks from just a few ratings. They get sharper as Moviz learns your taste.", reasons read "Because you loved {title} ({year})"   → AC-3, AC-4
- [x] Finished user with 5 or more liked ratings → no early picks line   → AC-4
- [ ] Vary the anchor score: rate the anchor 7 or 8 → "liked"; rate it 6 → "rated"; anchor with no release year → no year and no parentheses   → AC-3 (Value sourcing: reason sentence)
- [ ] Open `/home` with a very long title as an anchor → the reason wraps fully, nothing is cut off   → AC-3
- [x] No rated or skipped movie appears in the grid; rate a movie in another tab, press Load more → it never appears   → AC-2, AC-12
- [ ] Catalog with no listable movies → "No picks yet", body "There are no movies to suggest right now. Check back soon.", no link   → AC-6
- [ ] Stop the database, open `/home` → header stays, "We couldn't load your picks." with Try again; restart the database, press Try again → picks load; while it runs a second press is ignored and "Loading your picks" is announced   → AC-7
- [x] Press Load more with the keyboard (Tab, Enter) → label "Loading more picks", `aria-busy`, focus stays on the button; then "{n} more picks loaded" is announced; no repeated movie   → AC-8, AC-12
- [x] Press Load more until a batch has fewer than 24 picks → the button is replaced by "That's all for now." and focus moves to it; reload with a first batch that is already short → focus does not move on load   → AC-9
- [x] Block the Server Action request (DevTools, block request URL or offline) and press Load more → picks stay, "We couldn't load more picks. Check your connection and try again." shows, focus is on Try again; go online and press it → works   → AC-10
- [x] Delete the session cookie in another tab and press Load more → "Your session ended. Sign in to see more picks." with a Sign in link to `/sign-in?returnTo=%2Fhome`, focus on the link   → AC-10
- [x] Axe scan of `/home` in the loaded, thin, load more error and done states; widths 320, 768 and 1280 with no sideways scroll; reduced motion on; every button and link at least 44px high   → AC-15
- [ ] `/design` shows the Load more bar in all five states and the new empty state copy   → AC-15 (design.md rule 6)
- [x] Turn JavaScript off and open `/home` → the line "Moviz needs JavaScript to show your picks. Turn it on and reload the page." shows below the h1, above the loading state; with JavaScript on that line is not rendered   → AC-16
- [x] With JavaScript on, load `/home` and watch the network tab → no request with a `Next-Action` header and no RSC request for `/home`; the first reason text is already in the document response   → AC-16
- [ ] Time the first batch on the deployed app (Vercel to Neon) and write the result here: ______ s. In a local production build against Neon, the page shell showed about 1 s after the request began and the picks followed about 1.3 s later (one sample, cold start)   → AC-5, Follow-up

## Commands
- [x] `pnpm typecheck` → clean   → all
- [x] `pnpm check` → clean   → all
- [x] `pnpm test` → passes (database tests need `DATABASE_URL_TEST`)   → AC-3, AC-11, AC-12
- [x] `pnpm exec playwright test -c playwright.auth.config.ts e2e/auth/feed.spec.ts` → passes (includes the AC-16 checks and the pending state scan)   → AC-1, AC-2, AC-4, AC-8, AC-10, AC-15, AC-16
- [x] `pnpm test:e2e` → passes (the `/design` page includes the Load more bar)   → AC-15
- [x] Run a page load and a Load more with the server log open → no rating, score, title or movie id in the log   → AC-14
- [ ] Count queries per page load and per press (one recommender call each; the spec 0007 query count stays flat)   → AC-13

## Decision settled
- AC-5 and AC-16 conflicted. Settled on 2026-11-11: keep streaming, rewrite AC-16 (no second request for the picks, a `noscript` line, browsing without JavaScript not supported). The old `test.fixme` in `e2e/auth/feed.spec.ts` is replaced by the two AC-16 checks above (built).

## Accepted without a browser run
Marked done on 2026-11-11 by the engineer, with these steps left unticked. The `/check verify` runs ended BLOCKED because they could not be forced in the browser. Covered instead by:
- Empty catalog (AC-6) and stopped database (AC-7): component tests in `src/feed/feed.test.tsx`, `feed-load-error.test.tsx` and `src/app/(protected)/home/error.test.tsx`.
- Null year, long title (AC-3): `src/feed/reason-sentence.test.ts`. The catalog held no such movie.
- Over 500 ids ending the feed (AC-9): `src/feed/load-feed-batch.test.ts`.
- Still manual: the `/design` look of all five bar states, the deployed first batch timing, and the query count per load and press.

## Acceptance-criteria coverage
- AC-1 … guards steps, `feed.spec.ts` · AC-2 … no rating, first batch steps · AC-3 … reason steps · AC-4 … strength steps · AC-5 … first batch, timing · AC-6 … empty catalog · AC-7 … stopped database · AC-8 … keyboard Load more · AC-9 … done line · AC-10 … blocked request, deleted session · AC-11 … `pnpm test` (action tests are for `/test`) · AC-12 … no repeat steps · AC-13 … query count · AC-14 … server log · AC-15 … axe, widths, reduced motion, `/design` · AC-16 … noscript line, no extra request

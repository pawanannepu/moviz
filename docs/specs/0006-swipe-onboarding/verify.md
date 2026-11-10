# Verify: swipe onboarding · spec 0006 · updated 2026-11-10
_Steps derived from spec 0006 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Sign in as a new user, open `/home` → you land on `/onboarding`                         → AC-1
- [x] As a finished user, open `/onboarding` → you land on `/home`, which looks unchanged     → AC-1
- [x] Signed out, open `/onboarding` → you land on `/sign-in?returnTo=/onboarding`            → AC-1
- [x] Read the deck order for two different users → same cards in the same order             → AC-2
- [x] Look at the first 10 cards → no card shares a genre with the two before it where avoidable → AC-2
- [x] Rate movies in `/onboarding` and look in the database → each shows once, none rated or skipped is shown again → AC-2, AC-6
- [x] Like, dislike and not seen by button, by drag and by arrow key → liked saves 8, disliked saves 2 (source `swipe`), not seen saves a skip and no rating → AC-3
- [x] Mark a movie withdrawn (`source_missing_at` set) while it is the current card, then swipe it → card is dropped, no error message → AC-3, AC-10
- [x] Counter reads "{n} of 10 rated" under 10 and "{n} rated" from 10; "See my picks" appears at 10 → AC-4
- [x] With a screen reader (or the live region text) swipe once → exactly one message such as "Liked Heat. 4 of 10 rated." → AC-4, AC-12
- [x] Swipe, then press the "Undo" toast action within 6 seconds → the movie is the current card again and the counter dropped → AC-5
- [x] Swipe, wait for the toast to go, press "Undo last swipe" → same result; swipe again → the toast is replaced, not stacked → AC-5
- [x] Undo a not seen swipe → only the skip is deleted; the movie returns; the count is unchanged → AC-5
- [x] Swipe liked, rate the same movie by another source (manual or import), then undo → rating stays, no card returns, no message → AC-5
- [x] Swipe, then reload → "Undo last swipe" is gone but every swipe is still saved and the counter matches the database → AC-5, AC-6
- [x] Leave after 5 ratings, come back → remaining cards only, counter shows 5 → AC-6
- [x] Press "See my picks" at 10 ratings → you land on `/home`; Back does not return to `/onboarding` → AC-7
- [x] Open the page in two tabs, undo down to 9 in tab 2, press "See my picks" in tab 1 → deck reloads and shows "Rate a few more movies first." → AC-7
- [x] Reach 20 ratings, and separately 10 ratings plus 30 cards dealt → end state "That's plenty" with "See my picks", heading has focus → AC-8, AC-12
- [x] From the end state press "Undo last swipe" → the last card returns, end state leaves, focus is on the card → AC-8, AC-12
- [x] Use up the whole pool with 3 ratings → "That's all the movies we have", "See my picks" works → AC-9
- [x] Empty catalog, no ratings → "Movies aren't ready yet. Try again later.", no finish → AC-9
- [x] Turn the database off and swipe → same card stays, "Couldn't save that swipe. Try again.", nothing is lost; retry works → AC-10
- [x] Make undo and finish fail → "Couldn't undo that. Try again." and "Couldn't finish just now. Try again."; screen unchanged, focus stays on "See my picks" → AC-10, AC-12
- [x] Press two controls at once (double click, swipe while undo runs) → only one action runs; deck, both undos and "See my picks" are disabled meanwhile → AC-10
- [x] Delete the account in another tab, then swipe → you are sent to sign in → AC-10
- [x] Complete the flow with the keyboard only → every swipe, undo and finish is reachable → AC-12
- [x] At 320 px wide → no horizontal scroll → AC-12
- [x] With reduced motion on → flow still works → AC-12
- [x] Run an axe scan on the deck, the end state and the finish button → no violations → AC-12

## Value sourcing (one check per row of the spec table)
- [x] User id: call each action with a body that names another user id → ignored, only the session user changes → AC-11
- [x] Card fields (`id`, `title`, `releaseYear`, `posterPath`): compare a card with its `movies` row → they match → AC-2
- [x] Pool: with more than 150 listable movies, the deck holds the 150 with most votes, ties by lower id → AC-2
- [x] Genres: the page data sent to the browser holds no genre field → AC-2
- [x] Available movies: a movie rated or skipped by user A still shows for user B → AC-2
- [x] Counters: change ratings in the database directly, reload → counter follows the database; imported ratings count in `rated`, only swipe ratings and skips count in `shown` → AC-4, AC-8
- [x] Score: liked saves 8, disliked saves 2 → AC-3
- [x] Listable check: set `source_missing_at` on a movie, call `swipeAction` for it → `movie_not_found`, nothing saved → AC-3, AC-10
- [x] Undo target: send `not_seen` for a liked movie, and `liked` for a movie liked with a different score → nothing deleted, `restored` false → AC-5
- [x] `onboarded_at`: finish twice → the first timestamp stays → AC-7
- [x] Finish rule: hand-call `finishOnboardingAction` with 3 ratings and cards left → `not_enough_ratings`, `onboarded_at` stays null; with an empty deck and one rating → succeeds → AC-7, AC-9
- [x] Redirect targets: `HOME_PATH` is `/home`, `ONBOARDING_PATH` is `/onboarding` → AC-1
- [x] Logs: run a full flow and read the server log → no line holds a movie id, a choice or a score → AC-11

## Commands
- [x] `pnpm typecheck` → clean                                                                → all
- [x] `pnpm check` → clean                                                                    → all
- [x] `pnpm test` → all pass (database tests need `DATABASE_URL_TEST`)                        → AC-2, AC-5, AC-7, AC-8, AC-9
- [x] `pnpm exec playwright test -c playwright.auth.config.ts` → all pass, includes `e2e/auth/onboarding.spec.ts` → AC-1, AC-3 to AC-7, AC-12
- [x] `pnpm test:e2e` → all pass (the swipe deck gained two optional props)                    → AC-12

## Acceptance-criteria coverage
- AC-1 … gate steps, redirect targets, auth e2e · AC-2 … order, pool, card fields, genres steps
- AC-3 … decision steps, score, listable check · AC-4 … counter and announcement steps
- AC-5 … undo steps (toast, button, reload, wrong choice, other source) · AC-6 … leave and return, reload
- AC-7 … finish steps, two tab step, finish rule · AC-8 … end state, undo from end state, counters
- AC-9 … used up pool, empty catalog · AC-10 … failure, in flight, deleted account steps
- AC-11 … user id step, logs step · AC-12 … keyboard, 320 px, reduced motion, axe, focus steps

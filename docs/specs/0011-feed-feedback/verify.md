# Verify: Feed feedback · spec 0011 · updated 2026-11-12

_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

You need a signed in user who finished onboarding and has a few liked ratings, a catalog with embeddings (`pnpm embed:catalog`), and migration 4 (`drizzle/0004_feed_feedback.sql`) applied to the database the app uses. "The feed" means `/home`.

## UI / manual

- [x] On the feed, look at any card → "More like this" and "Not interested" sit under the meta line, each at least 44px high with the focus ring; a screen reader names them "More like this: {title}" and "Not interested in {title}"; pressing either never opens the movie page, pressing the rest of the card still does → AC-1
- [x] Press "Not interested" on a card → the cell shows "Hidden from your picks." and Undo, with no animation; focus is on Undo; the live region says "{title} hidden from your picks" → AC-2
- [x] Press Undo → the card is back in the same place with its reason and an unpressed "More like this"; focus is on its "Not interested" button → AC-3
- [ ] Hide a movie, then press Load more and reload the page → the movie is in neither; open `/onboarding` style deck reads (or query the deck) → it is never offered → AC-4
- [x] Press "More like this" → `aria-pressed="true"`, a check icon and a lighter border (not colour alone), the label stays "More like this", focus stays; the live region says "More like {title} on your next picks"; press again → unpressed and "Removed more like {title}"; the other picks on the page do not change → AC-5
- [x] Mark a movie "More like this", reload → its button is still pressed if it shows, and at least one pick reads "More like {title} ({year}), as you asked" → AC-6, AC-8
- [ ] Open a movie whose card said "More like {title} ({year}), as you asked" → the page shows the same sentence → AC-8
- [ ] As a user with no ratings but one "More like this", open the feed → taste picks (no "popular films" line), with reasons naming that movie → AC-9
- [ ] Rate a movie you marked "More like this" (from `/lists`) → the feedback row is untouched in the database, and no pick says "More like {that title}" any more → AC-10
- [x] Open the page of a movie in your feed → the two controls sit under the poster and its reason; press "Not interested" → you stay on the page, the controls become "Hidden from your picks." and Undo, focus on Undo, the reason bar stays → AC-11
- [x] Open the page of a movie you hid, by its address → it opens in the hidden state with Undo; press Undo → the controls come back with focus on "Not interested" → AC-11
- [ ] Open the page of a movie you rated or skipped → no feedback controls → AC-11
- [x] Block Server Action requests (DevTools, request blocking) and press either button → nothing changes, "Could not save. Try again." shows beside the buttons, focus stays on the pressed button; a second press while one is pending does nothing → AC-12
- [x] Sign out in another tab, then press a button → "Your session ended." with a "Sign in again" link to `/sign-in?returnTo=` the current path, and focus on the link → AC-12
- [x] Open a card from the feed, hide it on the movie page, press browser back → the kept feed leaves it out, with no Hidden line → AC-15
- [x] Open a card, press "More like this" on the movie page, go back → the card's button is pressed; open it again, press Undo after hiding, go back → the card is back → AC-15
- [x] Hide a card on the feed, open another card, go back → the hidden card is left out → AC-15

## Commands

- [x] `pnpm exec playwright test -c playwright.auth.config.ts e2e/auth/feedback.spec.ts` → all pass: hide and Undo with focus and the live region, a hidden movie gone after reload, the "More like this" toggle and its reason, a failed save, the movie page hidden state and the kept feed, axe scans → AC-1 to AC-5, AC-8, AC-11, AC-12, AC-15
- [x] `pnpm exec playwright test -c playwright.auth.config.ts e2e/auth/feed.spec.ts e2e/auth/movie.spec.ts` → all pass: the feed and the movie page still work with the controls on the cards → AC-1
- [ ] `pnpm test src/recommend src/feed src/movie src/user-data src/db` → all pass (needs `DATABASE_URL_TEST`); `weights.test.ts` pins `MORE_LIKE_THIS_ANCHORS` 10 and `MORE_LIKE_THIS_WEIGHT` 1.0 → AC-6, AC-14
- [x] On the dev database: `select column_name from information_schema.columns where table_name = 'feed_feedback'` → `user_id`, `movie_id`, `kind`, `created_at`, and `pg_indexes` lists `feed_feedback_user_kind_created_idx` → AC-14
- [x] With a test user: set `more_like_this` twice, then `not_interested`, then clear, reading `feed_feedback` after each → one row, `created_at` kept on the repeat and reset on the change, no row at the end; an unknown movie id gives `movie_not_found` → AC-13
- [x] Eleven `more_like_this` rows, one of them rated → `loadTaste` returns ten feedback anchors, newest first, and the rated one is not among them → AC-6, AC-10
- [x] A user whose only anchor is a "More like this" movie M → no pick and no `reasonFor` names M as its own anchor, and M can still be a pick → AC-7
- [x] Download the account export → a `feedback` list with `movieId`, `title`, `year`, `kind`, `createdAt`; delete the account → no `feed_feedback` rows for that user → AC-14
- [x] Read the server log while giving feedback, including a failed save → no movie id, title or kind in any line → AC-14
- [ ] `pnpm typecheck && pnpm check && pnpm build` → all clean → all

## Acceptance-criteria coverage

- AC-1 the two buttons · UI step 1, the feed and movie specs
- AC-2 hide · UI step 2 and `feedback.spec.ts`
- AC-3 Undo · UI step 3 and `feedback.spec.ts`
- AC-4 stays gone · UI step 4 and `feedback.spec.ts`
- AC-5 the toggle · UI step 5 and `feedback.spec.ts`
- AC-6 feedback anchors · UI step 6, the anchor command and `weights.test.ts`
- AC-7 no self anchor · the self anchor command
- AC-8 the new reason · UI steps 6 and 7
- AC-9 taste from feedback alone · UI step 8
- AC-10 the rating wins · UI step 9 and the anchor command
- AC-11 movie page controls · UI steps 10 to 12 and `feedback.spec.ts`
- AC-12 pending and failures · UI steps 13 and 14 and `feedback.spec.ts`
- AC-13 the action · the upsert command
- AC-14 migration, export, delete, privacy · the schema, export and log commands
- AC-15 the kept feed · UI steps 15 to 17 and `feedback.spec.ts`

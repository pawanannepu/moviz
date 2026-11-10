# 0006. Swipe onboarding: a first run deck at /onboarding, saved one swipe at a time

**Date**: 2026-11-10
**Status**: Accepted

## Summary

A new user starts at a swipe deck of 150 well known movies and says liked, disliked or not seen. Each swipe is saved at once, and after 10 ratings a "See my picks" button appears. The deck ends by itself at 20 ratings or 30 cards, and a mistaken swipe can be undone. The deck lives at its own page, `/onboarding`, and `/home` sends anyone who has not finished there. No new tables are needed, because spec 0002 already holds everything this feature saves.

## Requirements

Seeded from scope feature 7 ("Swipe onboarding"). Its done when line is: a new user swipes through a deck (gesture or buttons), their choices are saved as ratings, they can stop at any point once enough signal exists, and they land on the feed. The feed (feature 9) does not exist yet, so "land on the feed" means land on `/home`, which feature 9 replaces.

**User stories**:
- As a new user with no history, I want to swipe a few movies I know so that Moviz learns my taste before I see my first picks.
- As a new user, I want to say "not seen" without being penalised so that a movie I have not watched does not count against me.
- As a new user, I want to undo a swipe I made by mistake so that a slip of the thumb does not shape my picks.
- As a user who leaves halfway, I want to come back and carry on where I stopped so that I do not start again.
- As a person using a keyboard or a screen reader, I want every swipe, the undo and the finish button to have a labelled control so that I can finish onboarding without a mouse or a touch screen.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: A signed in user whose `profiles.onboarded_at` is empty who opens `/home` is redirected to `/onboarding`. A signed in user whose `onboarded_at` is set who opens `/onboarding` is redirected to `/home`. A user with a finished onboarding sees the existing `/home` page unchanged. `/onboarding` is not a public path, so a signed out visitor is sent to `/sign-in?returnTo=/onboarding`.
- **AC-2**: The deck pool is the 150 listable movies with the most votes (`vote_count` descending, then `id` ascending). Cards are ordered by genre rotation: each next card is the first remaining movie, in vote order, that shares no genre with the previous two cards, or the first remaining movie when none qualifies. For a given catalog state the order is computed once over the whole pool and is the same for every user and every visit (the daily catalog job can change vote counts or listability, which may shift the order later; progress is counted, not positional, so this is harmless). The pool holds only listable movies, so a non listable movie never appears. The deck then drops every movie the user has rated or skipped, using the shared `unavailableMovies(..., "deck")` filter.
- **AC-3**: Liked, disliked and not seen each work by button, by drag and by arrow key, and each saves through `saveSwipe` (liked 8, disliked 2, source `swipe`; not seen saves a skip and no rating). Before saving, the action checks that the movie is still listable. The card advances only after the save succeeds. Repeating the same swipe is harmless.
- **AC-4**: The page shows a text counter: "{n} of 10 rated" while n is under 10, and "{n} rated" once n is 10 or more, where n is the user's total number of ratings from any source. A "See my picks" button appears when n reaches 10. After each successful swipe or undo, one polite announcement carries both the result and the count (for example "Liked Heat. 4 of 10 rated.").
- **AC-5**: After a swipe, one toast (a single fixed toast id, replaced by the next swipe and dismissed on undo, finish and the end state) offers "Undo" for 6 seconds, and an "Undo last swipe" button under the deck stays until the next swipe. Undo is for the stored last swipe only, and the request carries its `movieId` and `choice`. Not seen deletes only the skip. Liked or disliked deletes only a rating whose source is `swipe` and whose score matches that choice. When something was deleted, the movie returns as the current card and the counters drop (`restored: true`). When nothing was deleted (the rating is now manual or imported, or already gone) the card is not restored and the stored swipe is cleared without a message. Undo does not survive a reload or leaving the page.
- **AC-6**: A user can leave at any time. Every saved swipe stays. Returning to `/onboarding` (not yet finished) shows the remaining cards, and the counters come from the database, not from the browser.
- **AC-7**: "See my picks" saves `onboarded_at`, then the client calls `router.replace(HOME_PATH)`, so Back does not return to `/onboarding`. The server checks the rule itself: it refuses with `not_enough_ratings` unless `deckStatus` is not `swiping` (see Feature design). The first finish sets the timestamp; finishing again keeps the first timestamp and still succeeds. When the server refuses while the screen showed a finish button (for example a second tab changed the counts), the client reloads the deck from the server with `router.refresh()` and then shows "Rate a few more movies first."
- **AC-8**: When the user has 20 or more ratings, or has 10 or more ratings and 30 cards behind them (ratings with source `swipe` plus skips), the deck is replaced by an end state ("That's plenty") with a "See my picks" button. Undo from the end state brings the last card back and leaves the end state.
- **AC-9**: While the user has fewer than 10 ratings, the 30 card cap does not apply and the deck keeps serving cards. If every card in the pool has been dealt with while the user has fewer than 10 ratings, the end state ("That's all the movies we have") appears and "See my picks" is allowed, provided the user has at least one rating. A user with no rating and no card left (an empty or unseeded catalog) sees the error state "Movies aren't ready yet. Try again later." and cannot finish.
- **AC-10**: A failed save keeps the same card in place, announces and shows "Couldn't save that swipe. Try again.", and loses nothing. A swipe on a movie that is no longer listable (the catalog marked it missing meanwhile) drops that card and moves on. A failed undo or a failed finish shows its own message and leaves the screen as it was. A call without a live session, or for a user that no longer exists, sends the user to sign in. While any action is in flight, the deck, both undos and "See my picks" are disabled until it returns.
- **AC-11**: Every action reads the user from the live session (never from the request), validates its input with Zod, returns a typed result, and touches only that user's rows. No log line or event holds a movie, a choice or a score.
- **AC-12**: The whole flow works with the keyboard alone, at 320 px width with no horizontal scroll, and with reduced motion. The page passes the axe scan. Each result and count change is announced once (the toast is hidden from assistive technology, because the persistent button is the accessible undo), and the toast is never the only way to undo. After undo, focus goes to the restored card. A new end state takes focus on its heading. A failed finish keeps focus on "See my picks".

## Decision

**Chosen option**: Option 1: a dedicated `/onboarding` page whose server side builds the deck, with one Server Action per swipe.

Build the deck on a new `src/onboarding/` feature folder: a pure ordering function, a read that loads the deck and the user's counters, thin Server Actions for swipe, undo and finish, and one client component that wires the existing `SwipeDeck` to them. `/home` becomes the gate.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.claude/skills/nextjs-app-router-patterns/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.claude/skills/drizzle-orm-patterns/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.claude/skills/playwright-best-practices/`)

Next.js 16 has breaking changes (root `AGENTS.md`). Read the Server Actions, `redirect` and `use server` guides in `node_modules/next/dist/docs/` before writing the actions.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no new table and no new column, so no migration.

| Existing table | Key | Used for |
|---|---|---|
| `ratings` | (`user_id`, `movie_id`) | Liked 8, disliked 2, `source = 'swipe'`. Undo deletes a row only when `source = 'swipe'`. |
| `swipe_skips` | (`user_id`, `movie_id`) | Not seen. Undo deletes the row. |
| `profiles` | `user_id` | `onboarded_at` goes from null to a timestamp once. |
| `movies`, `movie_genres`, `genres` | `id` | The pool and the genre rotation are read at request time. Nothing about the deck is stored. |

Two counters are derived at read time and never stored:
- **rated** = the number of the user's `ratings` rows, whatever their source.
- **shown** = the number of the user's `swipe_skips` rows plus their `ratings` rows with `source = 'swipe'`.

**State transitions**: the deck has one status, computed by the pure `deckStatus({ rated, shown, remaining })`, checked in this order:

| Status | When | Screen |
|---|---|---|
| `ended_pool` | `remaining` is 0 | End state "That's all the movies we have", finish allowed |
| `ended_enough` | `rated >= 20`, or `rated >= 10` and `shown >= 30` | End state "That's plenty", finish allowed |
| `can_finish` | `rated >= 10` | Deck plus "See my picks" |
| `swiping` | otherwise | Deck, finish not allowed |

Finish is allowed in every status except `swiping`, with one extra rule: at `ended_pool` the user must also have at least one rating (otherwise the page shows the "Movies aren't ready yet" error state and the server returns `not_enough_ratings`). The server uses the same function, so the screen and the server cannot disagree. Profile state: `onboarded_at` null → set (once, never cleared).

**API surface** (Server Actions in `src/onboarding/actions.ts`; no Route Handler is needed):

| Action | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|
| `swipeAction` | `movieId`: positive integer, `choice`: `liked` or `disliked` or `not_seen` | `{ rated, shown }` | live session | `unauthenticated`, `invalid_input`, `movie_not_found`, `db_unavailable` |
| `undoSwipeAction` | `movieId`: positive integer, `choice`: `liked` or `disliked` or `not_seen` | `{ rated, shown, restored }` | live session | `unauthenticated`, `invalid_input`, `db_unavailable` |
| `finishOnboardingAction` | none | `{ onboardedAt }` | live session | `unauthenticated`, `not_enough_ratings`, `db_unavailable` |

`swipeAction` returns `movie_not_found` when the movie does not exist or is not listable (a withdrawn movie keeps its row, so `saveSwipe` alone would not fail). A `user_not_found` from `saveSwipe` or `markOnboarded` (account deleted mid session) is returned as `unauthenticated`. The client navigates after a finish result; no action calls `redirect`.

New data functions (all return `Result`, take `db` as an argument):

| Function | File | Does |
|---|---|---|
| `deckStatus`, constants | `src/onboarding/deck-rules.ts` | Pure. `MIN_RATED` 10, `AUTO_END_RATED` 20, `SHOWN_CAP` 30, `POOL_SIZE` 150, `UNDO_TOAST_MS` 6000. |
| `orderDeck` | `src/onboarding/order-deck.ts` | Pure. Genre rotation over a pool. |
| `countProgress` | `src/onboarding/count-progress.ts` | Counts `rated` and `shown` in SQL for one user. Used by `loadDeck` and by `swipeAction` and `undoSwipeAction`, which call it after their write commits. |
| `loadDeck` | `src/onboarding/load-deck.ts` | Reads the pool, orders it, drops unavailable movies, calls `countProgress`. Returns `{ cards, rated, shown }`. |
| `undoSwipe` | `src/ratings/undo-swipe.ts` | Takes `userId`, `movieId`, `choice`. Under the same per user and movie advisory lock as `saveSwipe`: for `not_seen` deletes only the skip; for `liked` or `disliked` deletes only a rating whose source is `swipe` and whose score is `swipeScore(choice)`. Returns `restored` (true only when a row was deleted). Succeeds when there is nothing to delete. |
| `markOnboarded` | `src/profile/profile.ts` | Sets `onboarded_at = coalesce(onboarded_at, now())`. |
| `finishOnboarding` | `src/onboarding/finish-onboarding.ts` | Loads the deck, refuses with `not_enough_ratings` when `deckStatus` is `swiping` (or `ended_pool` with no rating), else calls `markOnboarded`. |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Every action | The user id | `getUserForAction()` (spec 0005), never the request |
| `/onboarding` page | Card fields `id`, `title`, `releaseYear`, `posterPath` | `movies` columns, through the `SwipeCardMovie` shape from spec 0004 |
| `/onboarding` page | The pool | Top `POOL_SIZE` rows of `movies` where `isListable()`, ordered by `vote_count` desc nulls last, `id` asc |
| `/onboarding` page | A card's genres, for rotation only | `movie_genres` joined to `genres`; never sent to the browser |
| `/onboarding` page | Which pool movies are still available | `unavailableMovies(userId, movies.id, "deck")` run over the pool ids |
| Counter, end state | `rated`, `shown` | `countProgress` (definitions above), called by `loadDeck` and, after the write commits, by both swipe and undo actions |
| `swipeAction` | The score | `swipeScore(choice)` (spec 0002); a skip has none |
| `swipeAction` | Whether the movie may be swiped | `isListable()` over the movie row, checked before `saveSwipe` |
| `undoSwipeAction` | What to delete, and `restored` | The `choice` input (skip, or a swipe sourced rating with score `swipeScore(choice)`); `restored` is true only when a row was deleted |
| Undo toast and button | The stored last swipe | Client memory only: `{ movie, choice }` from the last successful `swipeAction` |
| Announcements | "Liked {title}. {n} of 10 rated." and the undo and error variants | Spec 0004 choice words plus the counters returned by the action |
| `finishOnboardingAction` | `onboarded_at` | The database `now()` |
| Finish check | Whether finishing is allowed | `deckStatus` over `loadDeck` output, on the server |
| Gate on `/home` and `/onboarding` | Whether the user finished | `getProfile(...).onboardedAt` (null means not finished) |
| Redirects | Targets | `HOME_PATH` and a new `ONBOARDING_PATH = "/onboarding"` in `src/auth/paths.ts` |
| Announcements, toast | "Liked {title}", "Disliked {title}", "Marked {title} as not seen" | Spec 0004 copy; title from the card |
| Error messages | The strings in the table below | Fixed copy, chosen at the edge |

User messages, mapped at the edge:

| Result | Message or behaviour |
|---|---|
| `unauthenticated` | Go to `/sign-in?returnTo=/onboarding` |
| `db_unavailable` on swipe | "Couldn't save that swipe. Try again." The card springs back. |
| `db_unavailable` on undo | "Couldn't undo that. Try again." |
| `db_unavailable` on finish | "Couldn't finish just now. Try again." |
| `not_enough_ratings` | `router.refresh()` to reload the deck, then "Rate a few more movies first." |
| `movie_not_found` | The card is dropped without a message. |
| `invalid_input` | "Something went wrong. Try again." |

Screen copy: heading "What do you think of these?", line "Rate at least 10 movies. Not seen is fine, it just skips the movie.", counter as in AC-4, button "See my picks", undo button "Undo last swipe", toast "{Liked|Disliked} {title}" or "Marked {title} as not seen", with action "Undo" (the same strings as the spec 0004 announcements). End state titles "That's plenty" and "That's all the movies we have" (both with body "Your picks are ready." and the button "See my picks"). Empty catalog error state: "Movies aren't ready yet. Try again later."

Layout: `/onboarding` lives in `(protected)` with a header showing the wordmark and sign out only (no nav link, since `/home` would send the user straight back). Heading, line, counter, deck and the undo button fit one viewport at 320 px.

**Client behaviour** (one client component, `src/onboarding/onboarding-deck.tsx`):
- It receives `cards`, `rated`, `shown` from the page and keeps a queue. The current card is the head of the queue; `SwipeDeck` (spec 0004) shows it and handles focus and the live region.
- One shared `busy` flag covers every action. While it is set, `pending` is passed to the card and the undo button, the toast action and "See my picks" are disabled.
- On `onDecide` it calls `swipeAction`. On success it removes the card, stores `{ movie, choice }` as the last swipe, updates the counters from the result, replaces the toast (same toast id), and writes one combined announcement. On failure it clears `busy`, so the card springs back, and announces the error. `movie_not_found` drops the card.
- On undo (toast action or button) it calls `undoSwipeAction` with the stored `{ movieId, choice }`. When `restored` is true it puts the movie back at the head, updates the counters, announces "{title} is back. {n} of 10 rated.", and moves focus to the restored card. When `restored` is false it clears the stored swipe and does nothing else. The stored swipe is cleared by the next swipe or any undo, and is lost on reload.
- It derives the status with `deckStatus({ rated, shown, remaining: queue.length })` and renders the deck, the end state (heading takes focus), or the deck with "See my picks". A failed finish keeps focus on the button.
- On a successful finish it calls `router.replace(HOME_PATH)`.
- The toast uses the existing Sonner primitive and is hidden from assistive technology. The 6 second toast and the persistent button are the same undo.

**Key invariants**:
- A movie is never both rated and skipped for one user (spec 0002). Undo deletes under the same advisory lock, so a parallel save cannot leave both.
- The deck never shows a rated, skipped or non listable movie.
- `onboarded_at` is set at most once and never cleared.
- A user cannot finish with fewer than 10 ratings unless the deck is empty, whatever the browser sends.
- Undo removes a rating only when its source is `swipe` and its score matches the choice sent; it never touches an imported or manual rating, and it never removes a skip when the choice was liked or disliked.
- Undo is limited to "the last swipe" only in the browser. On the server any swipe sourced rating of the user can be undone, even after finish, so `rated` can drop below 10 with `onboarded_at` set. This is accepted: only the caller's own rows change.

**Security model**: `/onboarding` is protected like every page (not in `PUBLIC_PAGES`), and the page calls `requireUser(ONBOARDING_PATH)` itself because the proxy only sees the cookie. Each action calls `getUserForAction()` first and uses that user id only. A user can read and write only their own ratings, skips and profile row. Ratings are personal taste data, so no log line, event or error body holds a movie id, a choice or a score (root `AGENTS.md`). No special compliance scope beyond the privacy work in scope feature 17. Actions are not rate limited: they write only the caller's own rows, one small write per swipe, and the card cannot be swiped again until the save returns.

**Configuration required**: none. No new environment variable.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Happy path: a new user opens `/home`, lands on `/onboarding`, rates 10 movies by buttons, taps "See my picks" and lands on `/home`, which no longer redirects, verifies **AC-1**, **AC-3**, **AC-4**, **AC-7**
- Happy path: `orderDeck` over a fixed pool returns a stable order with no shared genre inside any window of three where avoidable, and the same order on repeat, verifies **AC-2**
- Happy path: a user with 5 ratings and 2 skips leaves, returns, and sees the same remaining cards and a counter of 5, verifies **AC-6**
- Happy path: swipe liked then undo; the rating row is gone, the movie is the current card again and the counter dropped; the same with not seen and the skip; undo from the end state returns to the deck; after a reload the undo is gone, verifies **AC-5**, **AC-8**
- Happy path: after a swipe and after an undo, exactly one combined announcement carries the result and the count, focus lands on the restored card, and a new end state takes focus on its heading, verifies **AC-4**, **AC-12**
- Failure case: undo with the wrong choice (not seen sent for a liked movie) deletes nothing and `restored` is false; undo of a rating whose source is now `import` or `manual` restores no card, verifies **AC-5**
- Failure case: a movie marked missing by the catalog (`source_missing_at` set) returns `movie_not_found` and the card is dropped, verifies **AC-10**
- Failure case: while one action is in flight the deck, both undo controls and "See my picks" are disabled; the toast keeps one id across swipes, verifies **AC-5**, **AC-10**
- Failure case: undo fails, and finish fails (database down); each shows its own message, the screen is unchanged and focus stays on the finish button, verifies **AC-10**, **AC-12**
- Failure case: a second tab changes the counts so the server returns `not_enough_ratings`; the client refreshes the deck and then shows the message, verifies **AC-7**
- Failure case: an empty catalog with no rating shows the "Movies aren't ready yet" error state and finish is refused, verifies **AC-9**
- Failure case: no log line holds a movie id, a choice or a score during a full run, verifies **AC-11**
- Happy path: `deckStatus` table test for each row of the status table, including the 20 rated and the 10 rated plus 30 shown edges, verifies **AC-8**, **AC-9**
- Failure case: the save fails (database down); the same card stays, the error shows, nothing is saved, and a retry works, verifies **AC-10**
- Failure case: a swipe on a movie removed from the catalog meanwhile drops the card, verifies **AC-10**
- Failure case: a hand made `finishOnboardingAction` call with 3 ratings and cards left returns `not_enough_ratings` and leaves `onboarded_at` null; with an empty deck it succeeds, verifies **AC-7**, **AC-9**
- Failure case: finish twice keeps the first timestamp; the same swipe twice in parallel leaves one row, verifies **AC-3**, **AC-7**
- Auth/permission: a signed out call to each action returns `unauthenticated`; a signed out visit to `/onboarding` redirects to sign in; a finished user visiting `/onboarding` goes to `/home`, verifies **AC-1**, **AC-11**
- Auth/permission: undo of a movie whose rating has source `import` or `manual` leaves the rating in place, verifies **AC-5**, **AC-11**
- Accessibility: keyboard only run of the whole flow at 320 px, an axe scan of the deck, the end state and the finish button, and a reduced motion run, verifies **AC-12**

## Build plan

Tracer Bullet (root `AGENTS.md`): the first slice is a thin thread through every layer, then each later slice thickens one strand.

1. **Thread: gate, deck, save, finish.** Add `ONBOARDING_PATH` to `src/auth/paths.ts` and fix the `HOME_PATH` comment. Add `deck-rules.ts` with the constants and `deckStatus`. Add `countProgress` and `loadDeck` with the pool query, the shared exclusion filter and the counters, ordered by vote count only for now. Add `markOnboarded` and `finishOnboarding`. Add `swipeAction` (with the `isListable` check) and `finishOnboardingAction`, both with Zod and `getUserForAction`. Add `OnboardingDeck` wiring `SwipeDeck` to `swipeAction`, a plain "See my picks" button shown whenever `deckStatus` is not `swiping` that calls the finish action and then `router.replace(HOME_PATH)`, the `/onboarding` page in `(protected)` with its header, and the `/home` redirect for unfinished users. Satisfies **AC-1**, **AC-3**, **AC-6**, **AC-7**, **AC-11** (session, Zod, own rows only)
2. **Genre rotation.** Add the pure `orderDeck` with its table test and use it in `loadDeck`. Satisfies **AC-2**
3. **Counter, announcements and end states.** Show the counter text, the single combined announcement after each result, the two end states with focus on the heading, the empty catalog error state, and the thin run rule (the cap lifts below 10, finish at `ended_pool` needs one rating). Satisfies **AC-4**, **AC-8**, **AC-9**
4. **Undo.** Add `undoSwipe` in `src/ratings/` (choice aware, returns `restored`), `undoSwipeAction`, the single id toast and the persistent "Undo last swipe" button, the card restore with focus, and the undo announcement. Satisfies **AC-5**, **AC-8** (undo from the end state)
5. **Failure handling and concurrency.** Add the shared `busy` flag, map every result to its message at the edge (including `movie_not_found`, `user_not_found` as `unauthenticated`, and `not_enough_ratings` with `router.refresh()`), keep the card and the focus in place on a failed save, undo or finish. Satisfies **AC-10**, **AC-7** (refresh path)
6. **Browser and accessibility pass.** Playwright specs for the full flow by button, drag and key, the keyboard only run at 320 px, the axe scans, reduced motion, the undo after reload check, and a check that no swipe content reaches a log line. Add the onboarding states to the `/design` page if any new component was made. Satisfies **AC-11** (no logging), **AC-12**

## Consequences

**Positive**:
- A new user reaches a usable taste signal in about a minute, and feature 8 (the recommender) gets real ratings to work on.
- No migration and no new table: the model from spec 0002 held up.
- The same pure `deckStatus` drives the screen and the server check, so the two cannot drift, and a hand made request cannot skip the minimum.
- Every swipe is saved at once, so leaving mid way loses nothing.

**Negative / tradeoffs**:
- Each swipe waits for one database round trip before the next card appears. On a slow connection this feels slower than an instant card, which is the price of never showing a swipe as saved when it is not.
- The pool is the 150 most voted movies, so every new user rates the same famous films and the first picks lean towards the mainstream until feature 8 widens them.
- Tying the pool to `vote_count` means a movie that loses its poster or is withdrawn silently leaves the pool, and the pool can shrink below 150.
- Only `/home` is gated. A user who types another protected address directly can skip onboarding and see an empty experience there; this is accepted while `/home` is the only real protected page.
- Letting a user finish with fewer than 10 ratings when the pool is used up means feature 8 must handle a thin profile.
- Undo is limited to the last swipe only in the browser; the server accepts an undo of any swipe sourced rating of the caller, so a user can in theory lower their count after finishing. Only their own rows change.
- The deck order can shift after the daily catalog job changes vote counts, so two visits on different days may differ.

**Neutral**:
- `HOME_PATH` stays `/home`, so sign in, verify email and the return path code do not change.
- `/home` for a finished user stays the placeholder page from spec 0005 until feature 9 replaces it.
- Rated count includes imported ratings, so after feature 11 a user who imports a Letterboxd file can finish onboarding with no swipes.
- Analytics events for onboarding (scope feature 10) are not added here.

## Follow-up

- [ ] Feature 8 (taste profile and recommender) must work with a thin profile, because a user can finish with fewer than 10 ratings when the pool is used up.
- [ ] Feature 9 (feed) replaces the `/home` placeholder and keeps the `onboarded_at` redirect to `/onboarding`.
- [ ] Feature 10 (analytics) can record "onboarding completed" from `finishOnboarding`; ratings content must stay out of it.
- [ ] Feature 11 (Letterboxd import): decide whether an import should also set `onboarded_at` directly, instead of relying on the rated count.
- [ ] Feature 13 (watchlist) adds watchlisted movies to the deck exclusion through `unavailableMovies`; nothing here changes.
- [ ] Preload the poster of the next card once the deck feels slow on a poor connection (not measured yet, so not built).
- [ ] `/sync` should add `src/onboarding/` to the Context files in root `AGENTS.md` once it exists.

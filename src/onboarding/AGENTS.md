# src/onboarding

The first run swipe deck. A new user rates movies at `/onboarding` until there is enough signal, then finishes and lands on `/home`. Governing spec: [0006](../../docs/specs/0006-swipe-onboarding/index.md). The page is `src/app/(protected)/onboarding/`, and `/home` is the gate that sends anyone with an empty `profiles.onboarded_at` here.

## Files

- [deck-rules.ts](deck-rules.ts): the constants (`MIN_RATED` 10, `AUTO_END_RATED` 20, `SHOWN_CAP` 30, `POOL_SIZE` 150, `UNDO_TOAST_MS` 6000) and the pure `deckStatus`, plus `canFinish` and `counterText`. The screen and the server both use `deckStatus`, so they cannot disagree.
- [order-deck.ts](order-deck.ts): pure genre rotation over the pool. The order is the same for every user.
- [load-deck.ts](load-deck.ts): `loadDeck` reads the pool (the most voted listable movies), orders it, drops what the user already rated or skipped, and returns the cards with the counters. Genres are read for ordering only and never leave this function.
- [count-progress.ts](count-progress.ts): `countProgress` gives `rated` and `shown` for one user in one query.
- [is-movie-listable.ts](is-movie-listable.ts): checks a movie is still listable before a swipe is saved.
- [finish-onboarding.ts](finish-onboarding.ts): refuses with `not_enough_ratings` while `deckStatus` is `swiping`, otherwise calls `markOnboarded` (`src/profile/profile.ts`).
- [actions.ts](actions.ts): the three Server Actions, `swipeAction`, `undoSwipeAction` and `finishOnboardingAction`. Undo itself lives in `src/ratings/undo-swipe.ts`.
- [onboarding-deck.tsx](onboarding-deck.tsx): the one client component. It wires `SwipeDeck` from `src/ui` to the actions, and owns the queue, the busy flag, the undo toast and the announcements.

## Rules

- Every action reads the user from `getUserForAction()`, validates input with Zod, returns a typed result and touches only that user's rows. No action redirects: the client navigates after a finish.
- Never log or return a movie, a choice or a score beyond what the caller sent. Ratings content stays out of logs and events.
- `rated` counts all of the user's ratings, whatever the source. `shown` counts skips plus ratings with source `swipe`. Both are derived at read time and never stored.
- A card advances only after its save succeeds. A failed save keeps the same card and keeps focus where it was.
- `onboarded_at` is set once and never cleared. No new table or column was needed, so there is no migration here.
- Next.js 16 differs from what you may remember. Read the Server Actions guide in `node_modules/next/dist/docs/` before changing the actions.

## Tests

Vitest files sit beside the code. Database tests skip without `DATABASE_URL_TEST`. The browser flow, including axe scans, is `e2e/auth/onboarding.spec.ts`, run with `pnpm exec playwright test -c playwright.auth.config.ts`.

_Drafted by /sync from the introducing change, worth a quick human pass._

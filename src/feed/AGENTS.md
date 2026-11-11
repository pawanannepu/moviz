# src/feed

The personalized feed on `/home`: up to 24 picks from the taste recommender, each with a one line reason, and a "Load more picks" button that adds 24 more. Nothing is stored, so every visit starts again at the top of the ranking. Governing spec: [0008](../../docs/specs/0008-personalized-feed/index.md), with [verify.md](../../docs/specs/0008-personalized-feed/verify.md).

## Key files

| File                  | Owns                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constants.ts`        | `FEED_BATCH_SIZE` (24) and the fixed copy: title, loading label, early picks lines, empty and error text, the noscript line, `morePicksLoaded(count)`                                                                                             |
| `reason-sentence.ts`  | Pure `reasonSentence(reason)`: "Because you loved Heat (1995)". The verb comes from `anchor.score` (9 to 10 loved, 7 to 8 liked, 6 rated). No year and no parentheses when the year is null. "Popular with film fans" for `popular`. No full stop |
| `load-feed-batch.ts`  | `loadFeedBatch(db, { userId, shown })`: exactly one `recommendMovies` call, maps each pick to `{ movie, reason }`, sets `done`                                                                                                                    |
| `feed.tsx`            | The async server component behind the Suspense boundary: early picks line, empty state, in page error, or the list                                                                                                                                |
| `feed-list.tsx`       | The one client list: picks, Load more state, dedupe by movie id, the live region announcement                                                                                                                                                     |
| `feed-load-error.tsx` | The in page first load error. Try again calls `router.refresh()` inside a transition                                                                                                                                                              |
| `feed-header.tsx`     | Wordmark link and Sign out, shared by the page and `home/error.tsx`                                                                                                                                                                               |
| `actions.ts`          | `loadMoreAction`, the only Server Action                                                                                                                                                                                                          |
| `types.ts`            | `FeedPick`, `FeedBatch`                                                                                                                                                                                                                           |

The page is `src/app/(protected)/home/page.tsx` (guards, header, `h1`, a `noscript` line, a Suspense boundary) and `home/error.tsx` (the page level error). The bar under the grid is `src/ui/load-more-bar.tsx`.

## Commands

```bash
pnpm test src/feed "src/app/(protected)/home" src/ui/load-more-bar.test.tsx   # unit and component tests, no database needed
pnpm exec playwright test -c playwright.auth.config.ts e2e/auth/feed.spec.ts  # browser flow with axe scans, needs the catalog and embeddings
```

## Conventions

- The guards on `/home` run before any recommender call: signed out goes to sign in, an unfinished user goes to `/onboarding`. The page itself never calls the recommender. Only `Feed` and `loadMoreAction` do, once each per load or press.
- `loadMoreAction` reads the user from `getUserForAction()` and never takes a user id from the client. It validates `shown` with Zod (up to 500 positive integers) and returns a typed result: `{ picks, done }` or `unauthenticated`, `invalid_input`, `db_unavailable`. It returns finished sentences, so the browser never builds a reason from raw rating data.
- `done` is true when a batch has fewer than 24 picks, or when the page would hold more than `MAX_SHOWN` (500, from `src/recommend/weights.ts`) distinct movies.
- No log line, thrown message, error body or analytics event holds a rating, score, title or movie id. `error.tsx` does not log the error.
- Server Actions from one client run one at a time, so the `pending` state in `FeedList` is the only guard against a double press. Do not add a ref lock or a queue.
- Focus rules (`LoadMoreBar`): focus stays on the one button while it works (`aria-disabled`, not `disabled`), moves to Try again or the Sign in link when a failure shows, and moves to the done line only on the change from `pending` to `done`.
- The page does not support browsing without JavaScript. The first batch streams behind a loading state, and React only reveals streamed content with a script. A `noscript` line below the `h1` says so.
- Use `retry` in `error.tsx`, not `reset`. In Next.js 16.4 `retry()` fetches the page again, while `reset()` only re-renders the same failed children.
- Feed cards are not links yet (the movie detail page is a later feature).

## Gotchas

- Needs `pnpm embed:catalog` to have run on the database. Without embeddings every user gets the popular fallback and the "popular films" line.
- One first batch takes about 2.5 to 3 seconds at 3,000 movies from a laptop (spec 0007). The loading state hides the wait. Measure on the deployed app before heavy use.
- A later batch can switch from "Because you loved..." to "Popular with film fans" part way through a visit when no scored candidates remain. That is expected.
- Tests: `loadMoreAction` has no rate limit (a follow up in the spec). In the browser spec, Server Action requests are told apart by the `Next-Action` request header, Playwright's text selectors skip `noscript`, so use `noscript p`, and wait for React to hydrate the button before clicking it.
- Component tests replace `./actions`, `@/db/client`, `next/navigation` and the sign out button, and run axe through `src/test-support/axe.ts`.

## Related specs

- [0008 Personalized feed](../../docs/specs/0008-personalized-feed/index.md)
- [0007 Taste profile and recommender](../../docs/specs/0007-taste-profile-recommender/index.md), which supplies the picks and reasons
- [0004 Design system and UI foundation](../../docs/specs/0004-design-system-ui-foundation/index.md), which owns `FeedItem` and the page states

_Drafted by /sync from the introducing change, worth a quick human pass._

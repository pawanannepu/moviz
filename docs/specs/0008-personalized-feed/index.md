# 0008. Personalized feed: a streamed first batch and a Load more button, computed on every visit

**Date**: 2026-11-11
**Status**: Accepted

## Summary

The feed is the `/home` screen. A user who finished onboarding sees up to 24 picks from the recommender (spec 0007), each one a poster with a one line reason such as "Because you loved Heat (1995)". The page shows its header and heading at once, a placeholder grid while the picks are worked out, and then the picks. A "Load more picks" button adds the next 24. Nothing new is stored: every visit is computed fresh, so there is no migration. The feed writes the reason sentences, because spec 0007 left the wording to this feature. The page needs JavaScript, like the rest of the signed in app, and tells a visitor without it so.

## Requirements

Seeded from scope feature 9 ("Personalized feed with reasons"). Its done when line is: a user who finished onboarding sees a feed of movies they have not rated, every card shows a reason, and loading, empty, and error states render. Specs 0004 (the feed item and the states) and 0007 (the recommender and its follow ups) set the rest.

**User stories**:
- As a user who just finished onboarding, I want to land on a feed of movies I have not rated so that I get something to watch right away.
- As a user, I want each pick to say why it is there, in words that match how strongly I rated the movie behind it, so that I can trust it.
- As a user with only a few ratings, I want to be told these are early picks so that I do not take them as my final taste.
- As a user, I want to ask for more picks, and never see the same movie twice in one visit.
- As a user on a slow connection or when the service is down, I want a clear loading state, and a clear error with a way to retry.
- As a keyboard or screen reader user, I want to load more picks and know that it worked.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: `/home` keeps its guards. A signed out visitor goes to the sign in page with `returnTo=/home`. A signed in user who has not finished onboarding goes to `/onboarding`. Only a finished user sees the feed. The guards run before any recommender call.
- **AC-2**: The first batch is one `recommendMovies` call with `limit` 24 and no `shown`. Its picks are shown in the recommender's order, as `FeedItem`s in the `feed-grid`, as a list. A rated or skipped movie never appears (spec 0007, AC-2). The cards are not links yet.
- **AC-3**: Every card shows a non empty reason sentence as real text in the subtitle bar. For a `similar_to_liked` reason the sentence is `Because you {verb} {title} ({year})`. The verb is `loved` for an anchor score of 9 or 10, `liked` for 7 or 8, and `rated` for 6. The year and its parentheses are left out when the year is null. For a `popular` reason the sentence is `Popular with film fans`. There is no full stop at the end. A 200 character reason wraps fully and is never cut off (spec 0004, AC-9).
- **AC-4**: When the profile `strength` is `thin` the page shows, above the grid, the line "Early picks from just a few ratings. They get sharper as Moviz learns your taste." When it is `none` the line is "These are popular films while Moviz learns your taste." When it is `ok` there is no line. The line has no link. It shows only above the list of picks, never with the empty state or the in page error.
- **AC-5**: The page shell does not wait for the recommender. The header (wordmark link and Sign out), the page title "Your picks" as the one `h1`, and a loading state are sent first. The loading state is the existing `LoadingState` with its default skeleton count and the status text "Loading your picks". The picks replace it when ready.
- **AC-6**: When the first batch has no picks, the page shows the `EmptyState` with the title "No picks yet" and the body "There are no movies to suggest right now. Check back soon." It has no action link, because a finished user cannot reopen the swipe deck.
- **AC-7**: When the first load returns `db_unavailable`, the feed area shows the `ErrorState` with the title "We couldn't load your picks." and the body "Check your connection and try again." The header stays. "Try again" re-runs the server render of the page. While that runs, further presses are ignored and a polite status "Loading your picks" is announced, because the old screen stays until the new one arrives. Any other thrown error goes to `src/app/(protected)/home/error.tsx`, which shows the same `ErrorState` and calls `retry`. In Next.js 16.4 `retry()` fetches the page again, while `reset()` only re-renders the same failed children, so `reset` must not be used.
- **AC-8**: While more picks may exist, a "Load more picks" button sits below the grid. Pressing it calls `loadMoreAction` with the ids of every pick on the page and appends the returned picks, up to 24, below the existing ones. While the call runs, the label is "Loading more picks", the button has `aria-disabled="true"` and `aria-busy="true"`, a second press does nothing, and focus stays on the button. When the call ends with n picks added, a polite live region says "{n} more picks loaded" ("1 more pick loaded" for one). The region is rendered empty on mount. Each announcement clears the text first and then sets it, so an identical message twice in a row is still read. When n is 0, nothing is announced and the done line carries the news.
- **AC-9**: The feed is done when a batch holds fewer than 24 picks, or when the number of distinct ids on the page after the batch is above 500. The server sets `done`. When it is true, the button is replaced by the line "That's all for now." The line has `tabIndex` -1. Focus moves to it only when the state changes from `pending` to `done`, after the AC-8 announcement is set, so a keyboard user is not dropped to the top of the page. If the first batch is already done, focus does not move on page load.
- **AC-10**: When `loadMoreAction` fails, the picks already on the page stay. A failure is a typed error result, or a call that rejects (a dropped connection, or the sign in guard in `src/proxy.ts` redirecting the action request when the cookie is gone). The client catches a rejection with `.catch(() => null)` and treats it as `db_unavailable`, as the onboarding deck does. The area below the grid shows "We couldn't load more picks. Check your connection and try again." in a polite live region, and the same one button now reads "Try again" and repeats the call. For `unauthenticated` the message is "Your session ended. Sign in to see more picks." and the control is a "Sign in" link to the sign in page with `returnTo=/home`. For `invalid_input` it shows the same message as `db_unavailable`. Focus moves to the Try again button or the Sign in link when the failure shows, so it is never dropped to the page body.
- **AC-11**: `loadMoreAction` reads the user from `getUserForAction()` and never takes a user id from the client. It validates its input with Zod (`shown`: up to 500 positive integers no larger than `Number.MAX_SAFE_INTEGER`) and returns a typed result: `{ picks, done }` or one of `unauthenticated`, `invalid_input`, `db_unavailable`. It does not redirect and does not throw for an expected failure. It returns the finished sentences, so the browser never builds a reason from raw rating data.
- **AC-12**: A pick whose movie id is already on the page is dropped from an incoming batch before it is added, so a visit never shows a repeat. A movie rated or skipped between two presses never appears (spec 0007, AC-12).
- **AC-13**: Nothing is stored. There is no table, column or migration. Each page load makes exactly one recommender call, and each press of Load more makes exactly one. A new visit starts again from the top of the ranking.
- **AC-14**: No log line, thrown message, error body, or analytics event holds a rating, a score, a title or a movie id. The only place a title and score-derived verb appear is the page the user is looking at.
- **AC-15**: The feed meets WCAG AA. `/home` passes an axe scan in a browser in the loaded, thin, load more pending, load more error and done states, and a component level axe test covers the empty state and the first load error state (the browser cannot force them). Every button and link is at least 44px high with a visible focus ring. There is no horizontal scroll from 320 to 1280 px. With `prefers-reduced-motion: reduce` nothing animates. Items added by Load more use the same reason reveal as the first batch.
- **AC-16**: The first batch arrives in the same server response as the page shell, streamed behind the loading state (AC-5), so the browser makes no second request to fetch the picks. Moviz does not support browsing without JavaScript: sign in, sign up, sign out and the swipe deck already need it, and React shows streamed content only when a script runs. A browser with JavaScript off sees a `noscript` line, "Moviz needs JavaScript to show your picks. Turn it on and reload the page.", directly below the `h1`, outside the Suspense boundary and above the loading state, instead of a loading state with no explanation. It is a `<noscript>` element holding one `<p>` in the page's body text style, with no role and no live region. With JavaScript on, the line is not shown. Supersedes the earlier AC-16 ("works with no JavaScript"), which could not hold together with AC-5.

## Decision

**Chosen option**: Option 1: render the first batch on the server behind a loading state, and add more with a Server Action behind a button.

Replace the placeholder `/home` page with the feed, keep its guards, and put the feed code in `src/feed/`. The page is thin. A server component calls `recommendMovies` and turns each reason into a sentence. One client component holds the list, the Load more button and its states. `loadMoreAction` is the only new action.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.claude/skills/nextjs-app-router-patterns/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `typescript-advanced-types` (`wshobson/agents`, `.claude/skills/typescript-advanced-types/`) · `tailwindcss` (`hairyf/skills`, `.claude/skills/tailwindcss/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.claude/skills/playwright-best-practices/`)

Next.js 16 has breaking changes (root `AGENTS.md`). Before writing the page, the Suspense wrapper and the action, read the fetching data, mutating data, caching and error handling guides in `node_modules/next/dist/docs/01-app/01-getting-started/` (files 06, 07, 08 and 10).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no new table, no new column, no migration. The feed reads through `recommendMovies` and `getProfile` and writes nothing.

| Existing source | Used for |
|---|---|
| `recommendMovies` (spec 0007) | The picks, each reason, and `profile.strength` |
| `getProfile` (`src/profile/profile.ts`) | The onboarding gate, `onboardedAt` |
| `FeedItem`, `EmptyState`, `ErrorState`, `LoadingState`, `MovieCardSkeleton` (`src/ui`, spec 0004) | Everything the user sees, no new look |

**Page composition** (top to bottom, designed to `design.md`, no new tokens):

1. Header: the wordmark linking to `/`, and the existing `SignOutButton`. The same shape as the onboarding header, so no `SiteHeader` and no landmark gap.
2. `h1` "Your picks", then a `noscript` line (AC-16) that only a browser with JavaScript off shows.
3. The early picks line (AC-4), when it applies.
4. The grid of `FeedItem`s in a list, using the `feed-grid` utility.
5. Below the grid: the Load more button, its pending and error states, or the "That's all for now." line.
6. A visually hidden live region for the "{n} more picks loaded" announcement.

**Files** (all under `src/feed/` unless noted):

| File | Does |
|---|---|
| `constants.ts` | `FEED_BATCH_SIZE` 24, and every feed string by name: `LOADING_LABEL`, `FEED_TITLE`, `NOSCRIPT_LINE`, `THIN_LINE`, `NONE_LINE`, `POPULAR_REASON`, `EMPTY_TITLE`, `EMPTY_BODY`, `LOAD_ERROR_TITLE`, `LOAD_ERROR_BODY` and `morePicksLoaded(count)`. The Load more bar's own labels and messages ("Load more picks", "Loading more picks", "Try again", "Sign in", the two failure messages and "That's all for now.") live in `src/ui/load-more-bar.tsx`, because they are part of that component. `MAX_SHOWN` is imported from `src/recommend/weights.ts`, not copied |
| `reason-sentence.ts` | Pure `reasonSentence(reason: Reason): string` (AC-3) |
| `load-feed-batch.ts` | `loadFeedBatch(db, { userId, shown })`: one `recommendMovies` call with `limit` 24, maps each pick to `{ movie, reason: string }`, sets `done`, returns a `Result` |
| `feed.tsx` | The async server component for the page: calls `loadFeedBatch`, then renders the early picks line, the empty state, the in page error, or `FeedList` |
| `feed-list.tsx` | The one client component: the picks, the list, the Load more button and its states, dedupe, the live region, the focus move at the end |
| `feed-load-error.tsx` | Client wrapper for the in page `ErrorState`; `onRetry` calls `router.refresh()` inside `startTransition` |
| `actions.ts` | `loadMoreAction` |
| `src/ui/load-more-bar.tsx` | The presentational bar below the grid: idle, pending, error, session ended, and done. Demoed on `/design` in every state (rule 6 of `design.md`) |
| `src/app/(protected)/home/page.tsx` | Thin page: guards, header, `h1`, the `noscript` line, a Suspense boundary around `Feed` |
| `src/app/(protected)/home/error.tsx` | Page level error boundary (AC-7). It renders the same header (wordmark and Sign out) above the `ErrorState`, because it replaces the whole page, and it calls `retry` |

`FeedItem` and `MovieCard` have no server only imports (`PosterImage` and `ReasonReveal` are already client components), so `FeedList` can render them from the client. The first batch is still rendered on the server and streamed in the same response (AC-16). The `MovieCard` doc comment says "A server component", which stops being true as a rule, so build task 1 corrects it.
`FeedList` takes the first batch as props and seeds its state from them. The only call to `router.refresh()` is in the in page error state, where `FeedList` is not mounted, so a refresh can never leave stale list state behind.

**API surface**:

| Function | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|
| `loadMoreAction(input)` in `src/feed/actions.ts` | `shown`: array of up to 500 positive integers (req) | `{ picks: FeedPick[], done: boolean }` | `getUserForAction()`; the user comes from the session only | `unauthenticated`, `invalid_input`, `db_unavailable` |
| `loadFeedBatch(db, { userId, shown })` | `userId`: string (req), `shown`: number[] (req, may be empty) | `{ picks: FeedPick[], strength, done }` | none, called by the page and the action after they know the user | `db_unavailable` (an `invalid_input` from the recommender is a bug and is thrown) |
| `reasonSentence(reason)` | a `Reason` from `src/recommend/types.ts` | string | none, pure | none |

Types, exported with a short doc comment each:

```ts
type FeedPick = { movie: MovieCardMovie; reason: string };
type FeedBatch = { picks: FeedPick[]; strength: TasteStrength; done: boolean };
type LoadMoreResult = Result<
  { picks: FeedPick[]; done: boolean },
  { code: "unauthenticated" | "invalid_input" | "db_unavailable" }
>;
```

`FeedPick` is plain data (numbers, strings, string arrays), so it crosses from server to client safely.

**State transitions** (the Load more area, held in `FeedList`; never stored):

| From | Event | To |
|---|---|---|
| `idle` | press | `pending` |
| `pending` | ok, `done` false | `idle` |
| `pending` | ok, `done` true | `done` |
| `pending` | `unauthenticated` | `session_ended` |
| `pending` | `invalid_input`, `db_unavailable`, or the call rejects | `error` |
| `error` | press Try again | `pending` |

`done` and `session_ended` are final for the visit. A page refresh starts again at `idle`.

Next.js runs Server Actions from one client one at a time, so the `pending` state is the only guard against a double press. Do not add a ref lock or a queue.

**Value sourcing** (every value each action produces or shows, and where it comes from):

| Action | Value produced / displayed | Source |
|---|---|---|
| Page and action | The user id | The page: `requireUser(HOME_PATH)`. The action: `getUserForAction()`. Never an input |
| Page | Whether to show the feed | `getProfile(db, { userId }).value.onboardedAt` is set (AC-1) |
| Page, action | The picks | `recommendMovies(db, { userId, limit: FEED_BATCH_SIZE, shown })` (spec 0007) |
| Page, action | The card fields of a pick | `pick.movie` from `recommendMovies`, already a `MovieCardMovie` (`id`, `title`, `releaseYear`, `posterPath`, `genres`), passed to `FeedItem` unchanged. The feed adds only `reason` |
| Page, action | The `shown` ids | Page: empty. Action: the input, validated by Zod; the client builds it from the ids of the `FeedPick`s on the page |
| Page, action | The reason sentence | `reasonSentence(pick.reason)`: the verb from `anchor.score`, the title and year from the anchor, fixed text for `popular` |
| Page | The early picks line | `result.profile.strength` and the constants in `constants.ts` |
| Page, action | `done` | `picks.length < FEED_BATCH_SIZE`, or `new Set(shown).size + picks.length > MAX_SHOWN` |
| Page | Which state shows | `Result` of `loadFeedBatch`: error is `db_unavailable`, an empty `picks` is the empty state, otherwise the list |
| Client | The ids to send on Load more | The ids of the picks in `FeedList` state, which includes the first batch passed as props |
| Client | The announcement text | The count of picks actually appended after the dedupe in AC-12 |
| Client | The sign in link for a lost session | `SIGN_IN_PATH` with `returnTo` set to `HOME_PATH`, built as `src/auth/session.ts` builds it |
| Client | The retry of the first load | `router.refresh()` |
| Page | The `noscript` line | `NOSCRIPT_LINE` in `constants.ts`, in a `<noscript><p>` directly below the `h1`, outside Suspense (AC-16) |
| Page | The poster address and alt text | `FeedItem` (spec 0004): `posterUrl(movie.posterPath, "w500")`, "Poster for {title}" |

**Key invariants**:
- A feed card always has a reason, and the reason is true: its verb never claims more than `anchor.score` supports, and a disliked movie is never named.
- No movie appears twice in one visit, however many times Load more is pressed.
- The guards run before the recommender is called, and an unfinished user never causes a recommender call from the page.
- The user id never comes from the browser.
- Nothing about a visit is stored, so the same data gives the same first batch (spec 0007, AC-1).

**Security model**: the page and the action read the live session. The action works only on the signed in user's own ratings, through `recommendMovies`, and sees public catalog rows otherwise. There is no new endpoint besides the Server Action, and no data from any other user. Ratings are personal taste data: nothing is logged or sent to analytics (root `AGENTS.md`). The action does not check that onboarding is finished: it exposes nothing the user could not already get from their own ratings, and the guard on the page is the product rule. No limit on how often it is called (decided with the engineer): it needs a signed in session, the button blocks double presses, and sign up sits behind Turnstile. A real limit needs shared storage and is a follow up. No compliance scope beyond scope feature 17.

**Configuration required**: no new environment variable. Prerequisite for good picks: `pnpm embed:catalog` has run against each environment's database. Without embeddings every user sees the popular fallback and the `none` line.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Happy path: a finished user with 8 liked ratings opens `/home` and sees 24 `FeedItem`s in a list, each with a sentence, none a movie they rated, in the recommender's order, verifies **AC-2**, **AC-3**
- Happy path: `reasonSentence` gives "loved" at scores 9 and 10, "liked" at 7 and 8, "rated" at 6, drops the year when null, and gives "Popular with film fans" for `popular`, verifies **AC-3**
- Happy path: strength `thin` shows the early line, `none` shows the popular line, `ok` shows none, and the line has no link, verifies **AC-4**
- Happy path: with `loadFeedBatch` mocked to resolve late, a Vitest render of the page shows the header, `h1` and the "Loading your picks" status first, then the picks, verifies **AC-5**
- Happy path: pressing Load more appends up to 24 picks with no repeat, announces "24 more picks loaded", and keeps focus on the button; the button is `aria-disabled` and ignores a second press while the call runs, verifies **AC-8**, **AC-12**
- Happy path: a short batch, and a call that pushes the page above 500 distinct ids, both return `done` and show "That's all for now." with focus on it, verifies **AC-9**
- Happy path: with JavaScript on, loading `/home` makes no request for the picks (no request with a `Next-Action` header and no RSC request for `/home` itself; the wordmark link may prefetch `/`, which is fine), and the document response body already holds the text of a pick's reason. With JavaScript off, the `noscript` line shows below the `h1` above the loading state, and with it on the line is not rendered, verifies **AC-16**
- Failure case: an empty catalog shows "No picks yet" with no link, verifies **AC-6**
- Failure case: with `loadFeedBatch` mocked to return `db_unavailable`, a Vitest render shows the in page `ErrorState` with the header intact; Try again calls `router.refresh()`, ignores a second press while pending and shows the "Loading your picks" status; a thrown bug renders `error.tsx` with the header and `retry`, verifies **AC-7**
- Failure case: in the browser, `page.route` on the Server Action request (matched by its `Next-Action` header) fails or aborts the call: the earlier picks stay, the error line shows, focus is on Try again, and Try again works once the route is removed. A mocked `unauthenticated` result shows the sign in link with focus on it, verifies **AC-10**
- Failure case: a delayed action response shows the pending label, ignores a second press, and a repeated "24 more picks loaded" is announced both times, verifies **AC-8**
- Failure case: an incoming batch that holds an id already on the page adds only the new ones, verifies **AC-12**
- Failure case: 501 ids, an id of 0, a string, and a missing `shown` each return `invalid_input` and read nothing, verifies **AC-11**
- Failure case: a spy on `console` during a page load and a Load more records no rating, title, score or movie id, verifies **AC-14**
- Auth/permission: a signed out request goes to the sign in page, an unfinished user to `/onboarding`, and neither causes a recommender call; `loadMoreAction` without a session returns `unauthenticated`, verifies **AC-1**, **AC-11**
- Auth/permission: the action ignores a `userId` field in its input, and two users get picks from their own ratings only, verifies **AC-11**
- Accessibility: a browser axe scan of `/home` in the loaded, thin, pending, load more error and done states, a component level axe test for the empty and first load error states, keyboard only use of Load more, widths 320 to 1280, and reduced motion, verifies **AC-15**
- Failure case: a first batch that is already done does not move focus on load, and a pending to done change moves focus to the done line after the announcement, verifies **AC-9**
- Cost: a page load makes one recommender call and a press makes one, verifies **AC-13**

## Build plan

Tracer Bullet (scope header and root `AGENTS.md`): the first slice is a thin thread through every layer, then each later slice thickens one strand. Tests are written by `/test` after the build (Beta workflow).

1. **Thread: the guarded page shows a real first batch.** Create `src/feed/` with `constants.ts`, the types, `reasonSentence` and `loadFeedBatch`. Replace the placeholder `/home` page: keep `requireUser` and the onboarding gate, add the header with `SignOutButton`, the `h1`, the `noscript` line (`NOSCRIPT_LINE`) and a Suspense boundary with `LoadingState` around the async `Feed`. `Feed` renders the batch as `FeedItem`s in the `feed-grid`, as a list. Read the Next.js guides named in Decision first. Correct the `MovieCard` doc comment, and note the time the first batch takes in `verify.md`. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-13**, **AC-16**
2. **The three non picks states.** Add the early picks line, the empty state, the in page `FeedLoadError` with `router.refresh()`, and `home/error.tsx`. Satisfies **AC-4**, **AC-6**, **AC-7**
3. **Load more, the working path.** Add `loadMoreAction` (session, Zod, typed result, `done`), `FeedList` as the client component that owns the picks and the button, the dedupe, the live region, and the final "That's all for now." with the focus move. Add `src/ui/load-more-bar.tsx` with its idle, pending and done states and show them on `/design`. Satisfies **AC-8**, **AC-9**, **AC-11**, **AC-12**
4. **Load more failures.** Add the `error` and `session_ended` states to `LoadMoreBar` and `/design`, and wire the retry and the sign in link. Satisfies **AC-10**
5. **Privacy, accessibility and the browser pass.** Check no log or event holds rating content, and the query count per load and per press. Write `e2e/auth/feed.spec.ts` for the flow with an axe scan in each state, widths from 320 to 1280, keyboard use, reduced motion, and the AC-16 checks (no extra request for the picks, and the `noscript` line with JavaScript off). Update the "Empty feed" line in `design.md` (see Follow-up). Satisfies **AC-13**, **AC-14**, **AC-15**, **AC-16**

## Consequences

**Positive**:
- The product promise lands: every card says why, in wording that does not overstate a mild like.
- No migration, no table and nothing to export or delete, because nothing is stored.
- The page is useful before the slow part finishes, and the first batch comes in the same response as the shell, with no second round trip.
- The feed reuses every spec 0004 piece, so there is no new look to maintain, and the one new component (`LoadMoreBar`) is shown on `/design` in every state.
- Load more is a real button, so keyboard and screen reader use needs no special handling beyond the announcement and the focus rule.

**Negative / tradeoffs**:
- One recommender call took about 2.5 to 3 seconds at 3,000 movies from a laptop (spec 0007). The first batch will feel slow until it is measured on the deployed app and tuned (the spec 0007 follow ups name the HNSW index or a cache). The loading state hides the wait but does not remove it.
- Every visit starts from the top of the same ranking, so until the user rates something, or feature 14 lets them dismiss picks, a returning user sees the same first picks.
- A finished user has no way to add ratings yet (import, watchlist and detail pages come in later slices), so the early picks line promises improvement the product cannot deliver today. It is worded as a promise about Moviz learning, not as an instruction.
- The page ends after at most 524 cards (the last allowed press starts from 500 ids or fewer and adds 24). A long session ends with "That's all for now." even if more movies exist, and a refresh brings back picks the user scrolled past.
- `loadMoreAction` has no rate limit. A signed in script could run the 700 ms query in a loop.
- The feed does not work with JavaScript off. The picks are in the response, but React keeps streamed content hidden until a script moves it, so a visitor without JavaScript sees only the loading state and the `noscript` line. This is accepted because the app around the feed already needs JavaScript. Making the feed work without it would mean not streaming, so every visit would wait about 3 seconds for a blank page.
- The cards are not links, because the detail page (feature 12) does not exist. Tapping a poster does nothing yet.
- Load more never refreshes the early picks line: `loadMoreAction` returns picks and `done` only, so the line shows the strength from the page load.
- A later batch can switch from personal reasons to "Popular with film fans" part way through a visit, when no scored candidates remain (spec 0007, AC-18). This is expected, not a bug.
- A pick dropped by the recommender's final card read (spec 0007) can make a batch one short, which ends the feed one press early. This is rare and fixed by a refresh.

**Neutral**:
- The reason wording lives in one pure function with the thresholds from spec 0007's follow up, so feature 14 and feature 15 can reuse it and add new `Reason` kinds in one place.
- The "Empty feed" copy in `design.md` and spec 0004 ("Swipe a few movies...", action "Start swiping") describes a state that cannot occur for a finished user, so this spec replaces it for the feed.
- Analytics for "feed viewed" is feature 10 and is not added here.

## Follow-up

- [ ] Update the "Empty feed" line in `design.md` to the copy in AC-6 (no "Start swiping" action), because a finished user is redirected away from `/onboarding`. `/develop` does this in build task 5. Spec 0004 line 142 keeps its history.
- [ ] Measure the first batch on the deployed app (Vercel to Neon) and record it in `verify.md`. If it is too slow, take the HNSW index or a cache from spec 0007's follow ups.
- [ ] If a no JavaScript requirement ever appears for signed in pages, the feed needs a render that does not stream (or a server rendered first screen without Suspense). This is a change to AC-5, so decide it then.
- [ ] Feature 12 (movie detail): give `FeedItem` an `href` and show "why it was recommended" there. The same `reasonSentence` is the source. Loaded picks and scroll position live in client state, so coming back from a detail page starts the feed again from the top. Decide then whether to keep them.
- [ ] Feature 14 (feed feedback): add "not interested" and "more like this" to the cards. Dismissed movies already join `unavailableMovies`, so the feed needs no change to hide them.
- [ ] Feature 10 (analytics): record "feed viewed" and "load more pressed" with counts only, never movie ids or titles.
- [ ] Add a per user limit on `loadMoreAction` with the launch hardening work, once shared storage exists.
- [ ] If the early picks line stays after imports and the watchlist exist, give `thin` users a way to add ratings, which needs a change to spec 0006's redirect for finished users.
- [ ] Root `AGENTS.md` "Built so far" and a new `src/feed/AGENTS.md` are `/sync` work after the build.

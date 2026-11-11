# 0008 Rationale: personalized feed

## Context

Scope feature 9 is the screen the whole product points at: the home screen of a movie recommender where every pick says why it was chosen. The pieces around it are done. Sign in and the route guard (spec 0005), the swipe deck that sends a finished user to `/home` (spec 0006), the recommender that returns ranked picks with a structured reason (spec 0007), and the feed card, subtitle bar, grid and page states (spec 0004). What is missing is the page that joins them, and the decisions the earlier specs deliberately left to it: the wording of each reason, the early picks note, how a failed load is retried, and how "load more" works.

Three forces shape the design. First, the recommender is computed on every call and stores nothing (specs 0002 and 0007), and one call takes about 2.5 to 3 seconds at 3,000 movies from a laptop, so the page cannot simply wait for it. Second, the reasons are the product: a mild 6 must not read like a favorite, and a popular fallback pick must not claim to be personal. Third, `/onboarding` redirects finished users to `/home`, so the feed cannot send a thin profile back to the deck, and a user has no other way to add ratings until later slices land.

If this is not decided, the placeholder "You're signed in" page stays and the first slice has no feed.

## Options considered

### Option 1: Server rendered first batch behind a loading state, Load more button through a Server Action

The page checks the guards, sends the header and heading, and streams the first 24 picks from a server component wrapped in Suspense. A client component holds the list and a "Load more picks" button that calls one Server Action with the ids already on the page. Nothing is stored.

**Pros**:
- The first batch is rendered on the server and arrives in the same response as the shell, and the shell appears before the slow call finishes. (The first version of this spec also claimed it worked without JavaScript. It does not, see the update at the end.)
- It matches how the project already works: Server Components by default, Server Actions with Zod and `getUserForAction()` (spec 0006), and the recommender's stateless `shown` paging (spec 0007).
- A button is the simplest control to make accessible and to test.
- No migration, no new endpoint, no new table.

**Cons**:
- Each visit is a fresh 2.5 to 3 second call, with no cache.
- The list holds up to 524 cards in the browser, and the page ends there.
- Every press costs one recommender call and has no rate limit yet.

### Option 2: Client fetched feed with infinite scroll through a Route Handler

The page is a thin shell. A client component fetches batches from a new Route Handler as the user scrolls, and shows skeletons until each one arrives.

**Pros**:
- Smooth, continuous scrolling.
- The first screen of the shell never waits on the database at all.

**Cons**:
- The first picks arrive only after hydration and a second round trip.
- A new endpoint needs its own session check, Zod, error mapping and tests, duplicating the Server Action pattern.
- Infinite scroll hides the footer and the TMDB notice, and is harder to use with a keyboard or a screen reader. It also raises a call per scroll with no obvious end.

### Option 3: Store a feed snapshot and the impressions

A table keeps what each user was shown and in what order, with a cursor. Later visits continue from where the user stopped and skip what they saw.

**Pros**:
- A returning user sees fresh picks instead of the same top of the ranking.
- A stored first batch could be served fast, with no 2.5 second call.

**Cons**:
- It contradicts spec 0002's rule that taste and reasons are computed on read, so the stored list goes stale the moment the user rates something.
- It adds a migration, a write on every view, and export and delete work for data that records what a person looked at.
- Feature 14 (dismissals) is the real answer to picks the user keeps ignoring, and it already needs no schema change here.

## Rationale

Option 1 fits every force above. The slow call is hidden by streaming instead of removed by storing, which is right while there is no measurement of production latency (a cache or index before measuring would add moving parts for a guess). Rendering the first batch on the server keeps the promise of the product in the first response, with no second round trip. The same Server Action pattern as onboarding keeps one error handling style for the project: a typed result mapped to a clear message at the edge.

Option 2 gives up the server render and the accessibility of a plain button to gain smoothness the feed does not yet need, and it adds an endpoint the project would have to maintain. Option 3 solves repeat picks by storing personal viewing history and giving up the compute on read rule, when feature 14 solves the same problem with no schema change. The engineer chose the stateless path for that reason.

The reason wording follows spec 0007's own follow up: the verb comes from `anchor.score`, so a user who rated a movie 6 reads "rated" and never "loved". The popular line says "Popular with film fans" because its source is TMDB vote data, not this user. The early picks note has no link because a link to the deck would loop (`/onboarding` redirects finished users), and the engineer chose to keep spec 0006 unchanged. The batch size is 24 because it divides evenly by 1, 2, 3 and 4 columns, so every batch ends on a full row at every width, at the same recommender cost as 20. No rate limit is added now because a real one needs shared storage and the app is a free product with Turnstile on sign up. It is recorded as a follow up instead.

The engineer's choices, in order: Load more button, three tier wording with the year, a quiet note with no link, stateless, "Popular with film fans", an in page error with Try again, a header with the wordmark and Sign out, design from `design.md`, 24 per batch, no rate limit now, no references. Every one matched the recommended option.

## Update 2026-11-11: AC-5 and AC-16

The first build found that AC-5 (the shell streams ahead of the picks) and AC-16 (the feed works with no JavaScript) could not both hold. React streams a slow part into a hidden holder and moves it into place with a small script. With JavaScript off, a real browser shows only the loading state, and the picks stay hidden even though they are in the response. A browser test showed it.

Three ways out were weighed:
- **Keep streaming, drop the no JavaScript promise, add a `noscript` line.** Chosen. The signed in app already needs JavaScript: the sign in form, the Turnstile bot check on sign up, Sign out and the swipe deck are all client code, so a visitor without it cannot reach `/home` anyway. The line turns a loading state that never ends into a clear message.
- **Keep streaming, drop the promise, say nothing.** Simpler, but the visitor sees "Loading your picks" for ever.
- **Drop streaming so the picks are visible without JavaScript.** The page would wait for the recommender (about 3 seconds from a laptop) and show nothing until it finished, which is the problem AC-5 exists to prevent, and it would buy a case that the rest of the app does not support.

The engineer chose the first, which was also the recommendation.

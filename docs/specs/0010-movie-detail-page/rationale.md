# 0010 Rationale: movie detail page

## Context

Scope feature 12 is the first screen behind the feed. Until now a feed card was a dead end: spec 0008 left the cards without links because there was no page to open. The catalog already holds everything a movie page needs (spec 0003), and `getMovie` already reads it in three queries with genres, directors and cast in billing order.

Four forces shape the design.

- **The reason is the product.** `design.md` says a reason is set like a film subtitle on the poster, is never cut off and never hidden. A page that drops or rewords the reason breaks the one promise Moviz makes. Spec 0002 already ruled that the reason is computed on read, that nothing passes through the URL and that nothing is stored.
- **The recommender is slow, but one movie is not.** A feed batch scans about 3,000 movies against up to 40 anchors and takes about 3 seconds. Finding the reason for one known movie needs one movie against at most 30 liked anchors.
- **The feed loses its place.** Loaded picks live in component state. Leaving the page drops them, so every trip to a movie would cost the user their position and a fresh 3 second load. Next.js 16 can keep page state itself, but only with Cache Components turned on, which this project has off and which changes how every page renders.
- **Solo builder, no schema budget.** Spec 0002 planned no migration for this feature. The page is signed in only and SEO is not a goal.

Without a decision, `/develop` would have to invent the page composition, the address, the reason rule and the feed behavior on its own.

## Options considered

The largest choice was how the detail page and the feed live together.

### Option 1: A full page, with the feed kept in a client store in memory

A normal route at `/movie/[id]`. A small React context mounted in the `(protected)` layout holds the feed's loaded picks. The feed list restores from it on mount and focuses the card that was opened.

**Pros**:
- One view of the page, at one address, that works the same from a card, a reload or a typed link.
- A small change inside `src/feed`, and nothing written to browser storage.
- A history return reuses the page Next.js already cached, so no recommender call.

**Cons**:
- The store is custom code doing what the framework could do with Cache Components.
- A kept list can go stale, so it needs a rule for when to drop it.

### Option 2: Open the detail as an overlay on the feed (intercepted route)

From the feed, the page opens over the list through a parallel and intercepted route. A direct visit shows the full page.

**Pros**:
- The feed never unmounts, so its state and scroll position are kept by construction.
- Feels fast, because the list stays on screen.

**Cons**:
- Two renderings of one page to build, test and keep alike.
- A dialog pattern (focus trap, close rules, scroll lock) that `design.md` does not have.
- Reload and share change what the user sees for the same address.

### Option 3: Turn on Cache Components and let Next.js keep the state

Set `cacheComponents: true`. Next.js then hides a page instead of unmounting it and restores state and scroll on return.

**Pros**:
- No custom store. This is the framework's own answer.
- Every later page gets the same behavior for free.

**Cons**:
- It changes rendering rules for every existing page (dynamic reads must sit behind Suspense or be cached), which is a stack decision under spec 0001, not a feature detail.
- All shipped pages would need a pass and a retest before this feature could start.

### Option 4: A full page, and the feed starts from the top

Build the page and leave the feed as it is.

**Pros**:
- Nothing to build beyond the page.

**Cons**:
- Every visit to a movie loses the user's place and costs a 3 second reload, which punishes the exact action this feature adds.

## Rationale

Option 1 fits the forces. The feed's cost and its lost place make Option 4 a bad trade the moment cards become links. Option 3 is where this likely ends up, but it is a change to the foundation with a wide blast radius, and a solo builder should take it on its own terms, not as a side effect of a movie page. Option 2 buys the same result as Option 1 at the price of a second view and a new dialog pattern. A context in a layout is plain React, is small enough to delete when Option 3 arrives, and keeps reason sentences out of browser storage.

**The reason rule.** The engineer chose to show a reason whenever one exists, and the popular line when the user has no taste signal. This spec pins "exists" to the feed's own filters: listable, and not rated or skipped. That gives one honest definition (a reason shows only for a movie the feed could show you) and reuses `isListable` and `unavailableMovies`, so features 13 and 14 change both surfaces at once. A marker in the link (`?from=feed`) was rejected because it bends spec 0002's rule and breaks on reload and share. A similarity floor was rejected because there is no usage data to set the number, and it would let a feed card lose its reason on its own page.

**Why `reasonFor` copies the anchor rule and does not call `recommendMovies`.** The feed's reason for a pick is the liked anchor with the largest `weight * similarity`. Dislikes, the popularity nudge and the variety cap change a pick's rank, never its anchor. So one small read over at most 30 anchors gives the same answer the 3 second scan would, and the two can be tested against each other.

**Smaller calls.**
- *Address*: `/movie/[id]` with our own id. The feed already holds it and `getMovie` reads by it. A slug needs a redirect rule and a TMDB id needs a lookup, and neither buys anything without SEO.
- *Access*: any signed in user. An onboarding check would bounce a new user away from a shared link for no gain.
- *Not found*: unknown and removed. A removed movie keeps only its title and date, so there is nothing to show. A movie without a poster still has a full page.
- *Rated movies*: no bar. A rated movie is never a pick, and showing the user's rating belongs to feature 13.
- *Cast*: the first 8, text only. Photos need a new image helper and a fallback, and faces would compete with the poster, the only color on the page.
- *Loading*: the same shape as `/home` (guards, then a Suspense boundary). A `loading.tsx` file would give the same skeleton but would move the guards inside the stream, so redirects and the bad id 404 would lose their real status.
- *Prefetch off*: the Next.js docs name large lists of links as the case for it.
- *Stale kept feed*: comparing the first batch ids drops the list when ratings change the top of the ranking, without the import feature having to know the store exists.
- *Return focus*: focusing the opened card's link matches what a browser does on a real page return, and brings the card into view.

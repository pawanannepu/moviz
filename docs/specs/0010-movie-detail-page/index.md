# 0010. Movie detail page: one page per movie at `/movie/[id]`, with its reason, and a feed that keeps its place

**Date**: 2026-11-11
**Status**: In Progress

## Summary

Every movie gets its own page at `/movie/[id]`: the poster, the title, year, runtime and genres, the tagline, the synopsis, the director and the first 8 cast members. The poster carries the same yellow reason line the feed card showed, worked out on the server from your ratings each time, never passed in the link. Feed cards become links to this page, and the feed now keeps its loaded picks in memory, so going back puts you where you were. No table or column changes.

## Requirements

Seeded from scope feature 12 ("Movie detail page"). Its done when line is: tapping a feed card opens the detail page, it works on phone and desktop, and an unknown movie shows a not found state. Spec 0002 names where the reason comes from (computed on read, nothing through the URL, nothing stored). Spec 0008 left two follow ups for this feature: give `FeedItem` an `href`, and decide whether the feed keeps its loaded picks and scroll position.

**User stories**:
- As a user, I want to tap a pick and read what the movie is about and who is in it, so that I can decide whether to watch it.
- As a user, I want the page to say why this movie was picked for me, in the same words the feed used, so that the card and the page agree.
- As a user, I want to go back to the feed and find it where I left it, so that opening a movie does not cost me my place.
- As a user who follows an old or mistyped link, I want a clear not found page with a way back.
- As a keyboard or screen reader user, I want to open a movie, read it in a sensible order, and return to the same card.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: The page lives at `/movie/[id]`, where `id` is our own catalog movie id. It is closed to signed out visitors: they go to the sign in page with `returnTo=/movie/{id}`. Any signed in user may open it. There is no onboarding check. The path is not added to `src/auth/public-paths.ts`.
- **AC-2**: The `id` segment is valid only when it is 1 to 15 digits with no leading zero (`^[1-9][0-9]{0,14}$`). Any other value (`0`, `012`, `12a`, `1.5`, `-3`) gives the not found state with a real 404 status, and no movie read runs for it. The order is fixed: parse the id (pure, no read), then `requireUser` (with `moviePath(id)`, or `HOME_PATH` when the id is invalid), then `notFound()` for an invalid id. A visitor with a stale session therefore always goes to sign in first.
- **AC-3**: An id that matches no movie, and a movie TMDB no longer returns (`removed: true` from `getMovie`), both give the not found state: the header, the title "Movie not found", the body "This movie is not in Moviz. It may have been removed.", and a link "Back to picks" to `/home`. `not-found.tsx` replaces the whole page, so it draws `FeedHeader` itself, and its link is always a plain link (no history step). A movie that exists but has no poster is not "not found": it shows with the dark title frame `PosterImage` already draws.
- **AC-4**: For a found movie the page shows, in this DOM order: the "Back to picks" link, the poster (`w500`, alt text "Poster for {title}", loaded with `priority`), the reason bar when there is a reason (AC-7), the title as the one `h1`, the meta line (AC-5), the tagline, the synopsis (`overview`), the director line (AC-6), and the cast (AC-6). A part whose data is null or empty is left out with no placeholder and no empty heading.
- **AC-5**: The meta line is the year, then the runtime, then every genre name in the order `getMovie` returns them (alphabetical), joined by `", "`, for example "1995, 2h 50m, Crime, Drama". The runtime is worded `{h}h {m}m`, `{h}h` when the minutes are 0, and `{m}m` under one hour. A null year, a null or non positive runtime, or an empty genre list drops that part. An empty meta line is not rendered.
- **AC-6**: The director line reads "Directed by {names}", with the names in billing order joined the way `Intl.ListFormat("en-US", { type: "conjunction" })` joins them ("A", "A and B", "A, B, and C"). The cast is a list under an `h2` "Cast" with the first 8 cast members in billing order (`CAST_LIMIT = 8`). Each item reads "{name} as {character}", or the name alone when the character name is null or blank. There are no photos and no "show all" control.
- **AC-7**: The reason comes from a new recommender function, `reasonFor(db, { userId, movieId })`, and follows one rule. A movie has a reason only when the feed could show it to this user: it is listable (`isListable()`) and available (`unavailableMovies(userId, movies.id, "feed")`, so not rated and not skipped). Otherwise the result is `null`. For a movie that passes: when the user has no liked anchor, or the movie has no embedding for `EMBEDDING_MODEL` (the best anchor read returns no row, there is no separate check), the reason is `{ kind: "popular" }`. This matches the feed, which shows a movie with no embedding only through its popular fallback (spec 0007, AC-18). In every other case it is `{ kind: "similar_to_liked", anchor }`, where the anchor is the liked anchor with the largest `weight * similarity` for this movie, ties to the lower movie id, taken from the same capped anchors `loadTaste` gives the feed (spec 0007, AC-5 and AC-6). With unchanged ratings the page therefore shows the same sentence the feed card showed for that movie.
- **AC-8**: The reason is worded by the existing `reasonSentence` and shown in the existing `SubtitleBar` at the bottom of the poster frame, as real page text, in full, with no motion (the reason reveal stays a feed only moment). When `reasonFor` gives `null` there is no bar and no other text in its place.
- **AC-9**: When the movie read succeeds and `reasonFor` returns `db_unavailable`, the page shows the movie with no reason bar and no error message. A refresh tries again.
- **AC-10**: The page shell does not wait for the movie. After the guards and the id check, the header (the existing `FeedHeader`), the "Back to picks" link and a loading state go out first. The loading state is a static skeleton in the shape of the page (a poster frame and text lines) with the status text "Loading movie" for screen readers. When the movie read returns `db_unavailable`, the content area shows the `ErrorState` with the title "We couldn't load this movie." and the body "Check your connection and try again." "Try again" renders the page again on the server, ignores further presses while it runs, and announces "Loading movie". The header and the back link stay. The route also has an `error.tsx` with the same copy that uses `retry`, for anything thrown. It replaces the whole page, so it draws `FeedHeader` and a plain "Back to picks" link itself (as `home/error.tsx` draws its header).
- **AC-11**: Under 1024px the page is one column in the DOM order of AC-4, and the poster is at most 420px wide. From 1024px it is two columns inside `page-container`: the poster with its reason bar on the left, the text column on the right, and the "Back to picks" link above both. The title uses `type-headline`. Text lines stop at 62 characters. There is no horizontal scroll at any width from 320px to 1280px, and a long title wraps.
- **AC-12**: Every feed card links to its movie page: `FeedItem` is given `href={moviePath(movie.id)}`, so the title is the link and the whole card is clickable (the existing `MovieCard` behavior). The link has the global focus ring, works with Enter, and does not prefetch: `prefetch={false}` is fixed inside `MovieCard`, not a prop. `MovieCard` and `FeedItem` gain one optional prop, `onNavigate`, passed to the `next/link` prop of the same name, which runs only for a client side navigation (not when the card opens in a new tab).
- **AC-13**: The feed keeps its place. After a user presses "Load more picks" one or more times, opens a movie from a card, and returns (the browser back button, or "Back to picks"), the feed shows the same picks in the same order, including the loaded batches, and the Load more bar shows `done` when the list had ended and `idle` in every other case (a list left while loading, failed or signed out comes back ready to press again). The card that was opened is in view and its link has focus. A return through browser history makes no new recommender call. A restored list mounts its cards again, so a reason bar below the fold wipes in once more when it scrolls into view. That is accepted and no "already revealed" flag is kept.
- **AC-14**: The kept feed lives in memory only, in a client store mounted in the `(protected)` layout. Nothing is written to `localStorage`, `sessionStorage`, a cookie or the URL. A page reload and a sign out clear it. It is ignored when its user id is not the current user's. It is also dropped when the first batch the server sends has different movie ids, or a different order, from the first batch the kept list began with, so a change in ratings (for example an import) shows fresh picks. The store also forgets which movie was opened as soon as the current path is anything other than `/home` or `/movie/{opened}`.
- **AC-15**: "Back to picks" is a real link to `/home` and is at least 44px high. When the page's movie is the one the user last opened from the feed in this visit, activating it goes back one step in browser history instead. In every other case (a direct visit, a reload, JavaScript off, the not found and error pages, a visit to another page in between that was not `/home`) it navigates to `/home`.
- **AC-16**: The user id comes only from the live session (`requireUser`). The page takes no input except the `id` segment. `reasonFor` binds the user id in every read and reads only that user's ratings. No log line, thrown message, error body or analytics event holds a rating, a score, a reason sentence or an anchor title. The reason never appears in a URL.
- **AC-17**: One page view runs a fixed number of queries whatever the user's rating count: besides the session read, at most 7 (3 for `getMovie`, 4 for `reasonFor`). `getMovie` runs once per request even though the metadata and the page both need it. All reads of one `reasonFor` call share one read only `REPEATABLE READ` transaction. The anchor read is exact and never uses the HNSW index.
- **AC-18**: The page meets WCAG AA in every state (found with a reason, found without, loading, not found, error): an axe scan reports no violations, the skip link works, there is exactly one `h1`, the cast is a real list, tab order follows visual order, and every interactive target is at least 44px high with the global focus ring.
- **AC-19**: The page title is "{title} ({year}) · Moviz", with the year and its parentheses left out when the year is null, and "Movie not found · Moviz" for an invalid id, an unknown id and a removed movie. It is plain "Moviz" when the movie read fails or there is no session. `generateMetadata` reads the cached session (`getSession`) first and makes no movie read without one, never redirects and never throws. A route level `not-found.tsx` cannot set a title, so `generateMetadata` is the only source of it. The page sets `robots: { index: false, follow: false }`.
- **AC-20**: `design.md` gains a wireframe for this page and the new components. The `/design` page shows the detail view in each state: with a reason, without a reason, with no poster, with a long title and missing optional facts, the loading skeleton and the not found state.

## Decision

**Chosen option**: Option 1: a full page at `/movie/[id]`, with the feed kept in a client store in memory.

Build the detail page as a normal server rendered route, add `reasonFor` to the recommender as the single source of the reason, and keep the feed's loaded picks in a small client store above the page so a return restores them.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.claude/skills/nextjs-app-router-patterns/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.claude/skills/drizzle-orm-patterns/`) · `tailwindcss` (`hairyf/skills`, `.claude/skills/tailwindcss/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.claude/skills/playwright-best-practices/`)

Smaller calls made in this spec, each with its runner up:

| Choice | Pick | Why | Runner up |
|---|---|---|---|
| Function name | `reasonFor` (one reason) | The recommender gives exactly one reason per movie. Spec 0002 called it `reasonsFor` before that was known | Keep `reasonsFor` |
| Loading | Same shape as `/home`: guards first, then a Suspense boundary (a part of the page that streams in later) | Real redirects and a real 404 for a bad id, and the two pages behave alike | A `loading.tsx` file |
| Card prefetch | Off | A feed holds up to 524 links. Prefetching each one would call the server for pages most users never open | Prefetch on hover |
| Stale kept feed | Compare the first batch ids | Self healing with no link between the feed and the import feature | The import clears the store |
| Return focus | Focus the opened card's link | Brings the card into view and saves a keyboard user from tabbing past every card again | Scroll position only |
| Reason sentence home | Stays in `src/feed/reason-sentence.ts`, imported by `src/movie` | One wording function, no move | Move it to `src/recommend` |

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No new table, column, index or migration. The page only reads.

| Table | Used for |
|---|---|
| `movies`, `movie_genres`, `genres`, `credits`, `people` | The movie facts, through the existing `getMovie` |
| `ratings`, `swipe_skips` | Whether the movie is still available to this user, and the liked anchors |
| `movie_embeddings` | The similarity between this movie and each liked anchor |

**State transitions** (the kept feed, client memory only):

```
empty --(feed list mounts or changes)--> kept { userId, seedIds, picks, done: boolean, opened: null }
kept  --(a card link navigates)--------> kept with opened = that movie id
kept  --(feed list mounts, same user, same seedIds)--> restored; the focus effect then sets opened to null
kept  --(feed list mounts, other user or other seedIds)--> replaced by the fresh first batch
kept  --(path is not /home and not /movie/{opened})--> kept with opened = null
kept  --(reload, sign out)--> empty
```

`done` is the only Load more state that is saved. `pending`, `error` and `session_ended` are never stored.

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/movie/[id]` | Page, `src/app/(protected)/movie/[id]/page.tsx` | `id` path segment | The detail page | Signed in (`requireUser(moviePath(id))`) | Bad id, unknown or removed movie: not found. `db_unavailable`: error state |
| `reasonFor(db, { userId, movieId })` | Server function, `src/recommend/reason-for.ts` | `userId: string` (required), `movieId: number` (required, positive integer), both checked with Zod | `Result<Reason \| null, InvalidInput \| DbUnavailable>` | Caller passes the session user id | `invalid_input`, `db_unavailable`. Anything else is thrown again through `unexpectedDbError` |
| `loadMoviePage(db, { userId, movieId })` | Server function, `src/movie/load-movie-page.ts` | The same two values | `Result<{ movie: CatalogMovie; reason: string \| null }, MovieNotFound \| DbUnavailable>` | Caller passes the session user id | `movie_not_found` (unknown or removed), `db_unavailable` (movie read only) |
| `parseMovieId(segment)` and `moviePath(id)` | Pure, `src/movie/movie-path.ts` | A string, or a number | `number \| null`, and `/movie/{id}` | None | None |
| `FeedStore` | Client context, `src/feed/feed-store.tsx`, provider in `src/app/(protected)/layout.tsx` | `save(kept)`, `markOpened(movieId)`, `clearOpened()`, `read(userId, seedIds)` (pure, changes nothing), `opened` | The kept list or `null` | None (browser memory) | None |

No Server Action and no Route Handler are added.

How the pieces fit:

- `page.tsx` awaits `params`, parses the id, calls `requireUser`, calls `notFound()` when the id is invalid (the order in AC-2), then renders `FeedHeader`, `BackToPicks` and a Suspense boundary around an async `MovieDetail` server component. `MovieDetail` calls `loadMoviePage` and renders the movie, calls `notFound()` for `movie_not_found`, or renders the in page error for `db_unavailable`. `not-found.tsx` and `error.tsx` sit in the same route folder.
- `loadMoviePage` runs `getMovie` and `reasonFor` together (`Promise.all`). It maps a removed movie to `movie_not_found`, words the reason with `reasonSentence`, and turns a `db_unavailable` from `reasonFor` into `reason: null` (AC-9). An `invalid_input` from `reasonFor` is a bug in this feature, so it is thrown with a message that holds no data, as `loadFeedBatch` does.
- `generateMetadata` and `loadMoviePage` both read the movie through one `getMovie` wrapped in React `cache` (one read per request), in `src/movie/`. `generateMetadata` parses the id first and makes no read for an invalid one (AC-2).
- `reasonFor` opens one read only `REPEATABLE READ` transaction and runs at most four reads: the eligibility check, the two `loadTaste` reads, and the best anchor read. The best anchor read joins the capped liked anchors (ids and weights passed with `unnest`, as `scoreCandidates` does) to `movie_embeddings` twice, once for the anchor and once for this movie, orders by `weight * (1 - (movie.embedding <=> anchor.embedding))` descending then anchor id ascending, and takes one row. The order is on a weighted product over at most 30 rows, so the planner has no use for the HNSW index.
- `FeedList` takes a new `userId` prop from `Feed`. Its `useState` initializers call `read(userId, ids of initialPicks)`: with a kept list, the list starts from the kept picks and `done`; otherwise from `initialPicks`. `read` is pure, because React may render twice (Strict Mode). An effect saves the picks and `done` after every change. Each `FeedItem` gets `onNavigate={() => markOpened(movie.id)}`. Each list item carries `data-movie-id`. After a restore, one effect finds the item whose `data-movie-id` equals `opened`, focuses the link inside it, then calls `clearOpened()`.
- The provider watches `usePathname()` and calls `clearOpened()` when the path is neither `/home` nor `/movie/{opened}`.
- The store is only ever filled in the browser and a full page load empties it, so a kept list never meets server rendered HTML. No hydration guard (such as `useSyncExternalStore`) is needed.
- `BackToPicks` is a client component that renders a `Link` to `/home` and takes an optional `movieId`. On activation, when `movieId` is given and `store.opened === movieId`, it prevents the default navigation and calls `router.back()`. `not-found.tsx` and `error.tsx` render it with no `movieId`.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Page | The movie id | The `id` path segment, parsed by `parseMovieId` |
| Page | The user id | `requireUser(moviePath(id))`, the live session |
| Page | Title, year, runtime, tagline, synopsis, poster path | `movies.title`, `release_year`, `runtime_minutes`, `tagline`, `overview`, `poster_path`, through `getMovie` |
| Page | Poster address and size | `posterUrl(posterPath, "w500")` and `POSTER_DIMENSIONS.w500` (spec 0003, AC-13) |
| Page | Genres | `genres.name` through `movie_genres`, alphabetical, from `getMovie` |
| Page | Runtime wording | Pure `formatRuntime(runtimeMinutes)` in `src/movie/`, rules in AC-5 |
| Page | Meta line | Pure `detailMeta(movie)` in `src/movie/`: year, `formatRuntime`, all genres |
| Page | Director names | `CatalogMovie.directors` (credits with role `director`, billing order), joined with `Intl.ListFormat("en-US", { type: "conjunction" })` |
| Page | Cast names and characters | `CatalogMovie.cast.slice(0, CAST_LIMIT)`, `people.name` and `credits.character_name` |
| Page | Not found | `getMovie` returns `movie_not_found`, or `removed: true` (`movies.source_missing_at` is set) |
| Page | Page title | `title` and `releaseYear` from the cached `getMovie` |
| `reasonFor` | Whether the movie can have a reason | One read: the movie row where `isListable()` and `unavailableMovies(userId, movies.id, "feed")` |
| `reasonFor` | The liked anchors and their weights | `loadTaste(tx, userId)`, the same caps as the feed (30 liked) |
| `reasonFor` | Similarity | `1 - (movie.embedding <=> anchor.embedding)` on `movie_embeddings` where `model = EMBEDDING_MODEL` |
| `reasonFor` | The anchor's title, year and score | The `TasteAnchor` from `loadTaste`, without its weight |
| Page | The reason sentence | `reasonSentence(reason)` from `src/feed/reason-sentence.ts` |
| Feed card | The link address | `moviePath(pick.movie.id)` |
| `FeedStore` | The user id | `Feed` passes `userId` (from the session) to `FeedList` as a prop |
| `FeedStore` | `seedIds` | The movie ids of `initialPicks`, in order, at the time the kept list began |
| `FeedStore` | `opened` | Set through the card link's `onNavigate`, cleared by the focus effect or by the provider's path check |
| `FeedStore` | `done` | `true` when the Load more state is `done`, else `false` |
| Page | The page title for each case | `generateMetadata`: the cached `getSession`, `parseMovieId`, then the cached `getMovie` (AC-19) |
| All copy | Fixed strings | `src/movie/constants.ts`: "Back to picks", "Cast", "Directed by", "Loading movie", "Movie not found", "This movie is not in Moviz. It may have been removed.", "We couldn't load this movie.", "Check your connection and try again." |

**Key invariants**:
- A reason bar is shown only for a movie the feed could show this user. A rated or skipped movie, a removed movie and a movie with no poster never have one.
- The detail page and the feed word a reason through the same `reasonSentence`, from the same anchor rule, so they cannot disagree for unchanged ratings.
- Nothing about the reason is stored or sent through the URL. It is computed on each view.
- The kept feed never leaves browser memory and never outlives a reload.
- The page stays dark only, uses tokens and `type-*` utilities, and adds no motion.
- A movie page never calls `recommendMovies`. Only `reasonFor` runs, and it scores one movie.

**Security model**:
- Read only. The route guard (`src/proxy.ts`) checks the cookie, and the page reads the live session with `requireUser` before any movie read. `generateMetadata` checks the cached session too, so no movie title is read for a visitor without one.
- Movie facts are public catalog data, the same for every user. The reason is personal: it is built from the signed in user's own ratings, and the user id is never taken from the client.
- The `id` segment is the only input and is checked by a strict pattern before use. Queries bind it as a parameter.
- The store holds the user's reason sentences in memory. It is keyed by user id and cleared by the full page load that sign out already does.
- Poster requests go to TMDB with the browser's default referrer policy, which sends only the site origin, not the movie path.
- No rate limit is added. The page is signed in only and costs at most 7 small reads after the session. It joins the launch hardening follow up that spec 0008 opened for `loadMoreAction`.

**Configuration required**: none. No new environment variable, secret or service.

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: a finished user opens a feed card and sees the poster, title, meta line, tagline, synopsis, director line and 8 cast members, with the same reason sentence the card showed, verifies **AC-4**, **AC-7**, **AC-8**, **AC-12**
- Happy path: `formatRuntime` gives "2h 50m" for 170, "2h" for 120, "45m" for 45 and nothing for null and 0; `detailMeta` drops missing parts and lists every genre, verifies **AC-5**
- Happy path: one director, two and three are joined correctly; a cast member with no character shows the name alone; a movie with 20 cast rows shows the first 8 in billing order; a movie with no cast has no "Cast" heading, verifies **AC-4**, **AC-6**
- Happy path: `reasonFor` returns the anchor with the largest weighted similarity, ties to the lower id, and the same anchor `recommendMovies` names for that movie, verifies **AC-7**
- Happy path: a user with no liked rating, and a listable movie with no embedding, both get `popular`, verifies **AC-7**
- Happy path: a rated movie, a skipped movie, a movie with no poster and an unknown id all get `null` from `reasonFor`, and the page shows no bar, verifies **AC-7**, **AC-8**
- Happy path: load more twice, open a card from the third batch, go back: the same 72 picks show, that card is in view with focus, and no recommender request was made, verifies **AC-13**
- Happy path: "Back to picks" after opening from the feed goes back in history; on a direct visit it navigates to `/home`, verifies **AC-15**
- Happy path: the layout is one column at 360px and two columns at 1280px, with no horizontal scroll from 320px to 1280px and a long title wrapped, verifies **AC-11**
- Failure case: `/movie/0`, `/movie/012`, `/movie/abc` and `/movie/1.5` give the not found state with a 404 status and no movie read, verifies **AC-2**
- Failure case: an unknown id and a removed movie give the not found state with the "Back to picks" link and the not found page title; a movie with no poster renders with the title frame, verifies **AC-3**, **AC-19**
- Failure case: `reasonFor` returns `db_unavailable` while `getMovie` succeeds: the page renders with no bar and no error, verifies **AC-9**
- Failure case: `getMovie` returns `db_unavailable`: the error state shows with the header and back link, and "Try again" renders the page again, verifies **AC-10**
- Failure case: a user who leaves the feed while "Load more picks" is still loading returns to a bar that is ready to press, not stuck, verifies **AC-13**
- Failure case: opening a card in a new tab does not mark it as opened; after feed, movie, Import, back to the movie, "Back to picks" navigates to `/home` and the kept list still shows, verifies **AC-12**, **AC-14**, **AC-15**
- Failure case: a stale session on `/movie/abc` goes to sign in, not to a 404; the not found and error pages show the header and a plain back link, verifies **AC-2**, **AC-3**, **AC-10**
- Failure case: a kept list from another user id, or with different first batch ids, is not restored; after a reload nothing is restored; `localStorage` and `sessionStorage` stay empty, verifies **AC-14**
- Failure case: a thrown database error from `reasonFor` carries no user id, movie id, title or score in its message, verifies **AC-16**
- Auth/permission: a signed out visitor to `/movie/412` lands on sign in with `returnTo=/movie/412`; a signed in user who has not finished onboarding sees the page, verifies **AC-1**
- Cost: the query count of one view is the same for a user with 3 ratings and one with 300, and `getMovie` runs once per request, verifies **AC-17**
- Accessibility: axe reports no violations for the found, no reason, loading, not found and error states; there is one `h1`; the page title matches, verifies **AC-18**, **AC-19**
- Design: `design.md` holds the wireframe and `/design` renders every detail state, verifies **AC-20**

Test notes for the build: database tests for `reasonFor` follow the shared branch rules in `src/recommend/AGENTS.md` and take their own vector band (band 3). The browser spec goes in `e2e/auth/movie.spec.ts`, under `playwright.auth.config.ts`. `requireUser` URL encodes `returnTo` and the route guard does not, so compare the decoded value. Component tests run with React Strict Mode on for the restore and focus path.

## Build plan

Tracer Bullet: task 1 is a thin thread from a feed card to a real page through every layer. Each later task thickens one strand.

1. **Thread: a card opens a page.** Create `src/movie/` with `movie-path.ts` (`moviePath`, `parseMovieId`), `constants.ts`, the cached movie read and a first `loadMoviePage` (movie only). Add `src/app/(protected)/movie/[id]/page.tsx` with the guards, the id check, `FeedHeader`, and a bare `MovieDetail` (poster, title, synopsis), plus `not-found.tsx`. Give `FeedItem` its `href` in `FeedList`, set `prefetch={false}` on the `MovieCard` link and add the optional `onNavigate` prop. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-12**
2. **The reason.** Add `src/recommend/reason-for.ts` with its Zod input, the one transaction, the eligibility read and the best anchor read, and its unit and database tests. Call it from `loadMoviePage` beside `getMovie`, word it with `reasonSentence`, and show it in `SubtitleBar` on the poster. Map a `db_unavailable` reason to no bar. Check with `EXPLAIN` on the dev branch that the anchor read does not use the HNSW index. Satisfies **AC-7**, **AC-8**, **AC-9**, **AC-16**, **AC-17**
3. **All the facts and the layout.** Add `formatRuntime`, `detailMeta`, the tagline, the director line and the cast list with `CAST_LIMIT`. Build the one column and two column layout to `design.md` tokens, and `generateMetadata`. Satisfies **AC-4**, **AC-5**, **AC-6**, **AC-11**, **AC-19**
4. **Loading and failure.** Add the Suspense boundary with the detail skeleton and its status text, the in page error for `db_unavailable` (give `FeedLoadError` its copy as props, or add a sibling with the same behavior), and `error.tsx` with `retry`. Satisfies **AC-10**
5. **The feed keeps its place.** Add `src/feed/feed-store.tsx` and mount its provider in `src/app/(protected)/layout.tsx`. Pass `userId` from `Feed` to `FeedList`, restore from the store on first render, save on change, mark the opened card, and focus it after a restore. Add `BackToPicks`. Check in a real browser that a history return reuses the cached page with no recommender request and that the opened card is in view. If the focus call alone does not bring the card into view on some browser, also save `window.scrollY` in the store and restore it in a layout effect. Satisfies **AC-13**, **AC-14**, **AC-15**
6. **Accessibility, design record and the browser pass.** Add the wireframe and component notes to `design.md`, add every detail state to `/design`, run axe on each state, and check widths from 320px to 1280px and the keyboard path from a card to the page and back. Satisfies **AC-11**, **AC-18**, **AC-20**

## Consequences

**Positive**:
- The feed's promise carries through: the page a card opens gives the same reason in the same place.
- One rule decides when a reason shows, and it reuses the two shared filters (`isListable`, `unavailableMovies`), so later changes to what the feed hides apply here with no edit.
- No schema change, no new service, no new environment variable.
- Opening a movie no longer costs the user their place or a 3 second feed load.
- Later features (watchlist, search, where to watch) get a stable address and a page to add to.

**Negative / tradeoffs**:
- A movie far from the user's taste still names its closest liked movie, so "Because you loved Heat (1995)" can sit on a film that has little in common with Heat. The feed has the same property deep in its ranking. A strength floor was left out because there is no data to set it.
- The not found state for an unknown or removed movie is sent after the page shell has started, so its HTTP status is 200 (Next.js adds a `noindex` tag). Only a malformed id returns a real 404. The page is signed in only and not indexed, so this is accepted.
- A history return shows the kept list even when it is hours old, until a reload. The list is only dropped early when the first batch changes.
- A movie rated after the list was kept (for example by an import that leaves the first 24 picks unchanged) can still sit in the kept list. Its page then shows no reason bar.
- A fresh visit to `/home` (not a history return) still pays for one recommender call even when the kept list is then shown.
- Card links do not prefetch, so the first paint of a movie page waits for one server round trip. There is no pending hint on the card.
- The store holds up to 524 picks with their reason sentences in memory for the life of the tab.
- `FeedList` gains a second job (restore and save). Its tests need the store provider.
- On a return, reason bars below the fold play their wipe again when scrolled to, including ones the user saw before leaving.
- After a visit to another page in between (for example Import), "Back to picks" is a plain link, so that return pays for one feed load before the kept list shows.
- A user who has not finished onboarding can open a movie page, and its "Back to picks" link then lands on `/onboarding` through the `/home` guard.
- A removed movie has no page, so a future list of a user's own ratings cannot link to one. Feature 13 decides that then.

**Neutral**:
- Spec 0002 calls the function `reasonsFor`. It is built as `reasonFor`, because the recommender gives one reason per movie.
- `src/movie/` is a new feature folder. `src/recommend/` gains one file under spec 0007's rules.
- `FeedHeader` is reused as the header of a page that is not the feed. Its name can be revisited when a shared signed in header is designed.
- With JavaScript off the page still renders its shell, but the movie streams in behind a script, the same limit the feed already has.

## Follow-up

- [ ] Spec 0002 (lines on feature 12) and its follow up name `reasonsFor`. Tick that follow up and note the name `reasonFor` when this ships.
- [ ] Spec 0008 follow up "Feature 12 (movie detail)" is answered here: tick it when this ships.
- [ ] `/sync` after the build: a new `src/movie/AGENTS.md`, the `reasonFor` line in `src/recommend/AGENTS.md`, the store and the link rule in `src/feed/AGENTS.md` (its line "Feed cards are not links yet" becomes wrong), and "Built so far" in the root `AGENTS.md`.
- [ ] Feature 13 (watchlist and seen): decide what a rated movie's page shows in place of the reason bar, whether a removed movie needs a bare page, and clear or refresh the kept feed when a rating is saved.
- [ ] Feature 14 (feed feedback): a dismissed movie joins `unavailableMovies`, so its page loses the reason bar with no change here. Remove it from the kept feed when it is dismissed.
- [ ] Feature 16 (where to watch) adds its section to this page.
- [ ] If Cache Components is ever turned on (a stack decision, spec 0001), Next.js keeps page state itself and the feed store can be removed.
- [ ] Add a per user limit on this page with the launch hardening work, together with `loadMoreAction`.
- [ ] If taps on a card feel slow on the deployed app, add a pending hint with `useLinkStatus` or prefetch on hover.

# 0004. Design system and UI foundation: "the subtitle line"

**Date**: 2026-11-08
**Status**: In Progress

## Summary

Moviz gets one locked visual identity: a dark only look with a deep wine base, where the reason for every pick is shown like a film subtitle in subtitle yellow on the poster. This spec fixes the colors, fonts, spacing, motion and focus rules, and defines the base components for slice 1 (buttons, inputs, app shell, movie card, swipe card, feed item with reason, and the empty, loading and error states). It also builds the real signed out landing page so the identity is proven in the browser. Later features reuse these pieces and never redesign them.

## Requirements

**User stories**:
- As a film fan, I want the first screen to show what Moviz is and why its picks are different, so that I decide quickly whether to start swiping.
- As a film fan, I want every pick to show its reason on the poster, so that I never have to wonder why I am seeing it.
- As a person using a keyboard or a screen reader, I want every action, including swipe, to have a labelled button and a visible focus, so that I can use Moviz without a mouse or a touch screen.
- As the builder, I want locked tokens and ready components, so that each later feature assembles screens instead of inventing a look.

**Acceptance criteria** (the contract, each one IDed and independently checkable):
- **AC-1**: `src/app/globals.css` defines the color, type, radius and motion tokens in this spec exactly, and maps the shadcn semantic variables to them. The app is dark only: `color-scheme: dark`, no `prefers-color-scheme` block, no Geist font and no Arial fallback left from the scaffold.
- **AC-2**: A root `design.md` exists and matches the built result. It covers color tokens, type scale, spacing, motion rules, focus and keyboard rules, the dark only decision, every base component with its states, and the three wireframes.
- **AC-3**: A unit test reads the color tokens from `globals.css` and proves every text and background pair listed in this spec meets 4.5:1 (3:1 for large text and for borders of controls). The pairs are: Screen, Dust, Subtitle and Exit on Pit and on Curtain; Pit on Subtitle (primary button); Dust on the hover surface; Edge on Pit, on Curtain and on the hover surface; and Subtitle on the subtitle bar computed over both a pure white and a pure black poster pixel (which covers AC-9). The test fails if a token changes and a pair drops below its limit.
- **AC-4**: Archivo (with its width axis) and Atkinson Hyperlegible Next load through `next/font`. A Playwright test measures a layout shift score of 0 on `/`. The Moviz wordmark and headlines use Archivo, and all other text uses Atkinson.
- **AC-5**: Every interactive element shows a visible focus ring on keyboard focus (3px, Screen color, 3px offset). A "Skip to content" link is the first focusable element on every page and moves focus to `main`. Tab order follows visual order.
- **AC-6**: The primitives exist and follow the tokens: Button (primary, secondary, ghost, destructive; 44px minimum height), Input, Label, a Field wrapper that links its hint and error text with `aria-describedby` and sets `aria-invalid`, a static Skeleton, and a Sonner toaster mounted in the root layout (bottom center, dark theme, visible close button).
- **AC-7**: The root layout renders, once for every page, the skip link, `<main id="main-content" tabIndex={-1}>`, the Toaster and the TMDB footer from spec 0003, restyled to the tokens. A `SiteHeader` (wordmark link and a navigation list with the current page marked `aria-current="page"`) is rendered by the layout of each route group that wants one. `/` has no header.
- **AC-8**: `MovieCard` shows a 2:3 poster from `posterUrl` (default size `w342`, `w500` on feed items, the swipe card and the hero), with alt text "Poster for {title}", the title, and a meta line "{year}, {first two genres}" with missing parts dropped. When the poster is missing or fails to load (including a failure before hydration), it shows a Curtain frame with the title set in Archivo. Posters are shown with `next/image` and `unoptimized` (spec 0003 hotlinks from TMDB).
- **AC-9**: `FeedItem` is a `MovieCard` that requires a non empty `reason`. The reason is real text in the page (not part of an image), shown in a subtitle bar at the bottom of the poster. A reason of 200 characters wraps fully, the bar grows to fit, and nothing is cut off. Its contrast is proven by AC-3.
- **AC-10**: `SwipeCard` always shows three labelled buttons, "Dislike", "Not seen" and "Like" (text plus icon, 44px minimum), and each calls `onDecide` with `disliked`, `not_seen` or `liked`. All three work with no drag at all.
- **AC-11**: On `SwipeCard`, dragging the poster past the threshold commits right as `liked`, left as `disliked` and up as `not_seen`, with mouse, touch and pen. Releasing below the threshold returns the card. While dragging, the subtitle bar shows the pending action word.
- **AC-12**: On the focused `SwipeCard`, ArrowRight, ArrowLeft and ArrowUp do the same as the three buttons, and ArrowUp does not scroll the page. The card is a `role="group"` named "{title}, {year}", described by visible hint text ("Use arrow keys or the buttons") and marked with `aria-keyshortcuts`. A polite live region that stays mounted outside the card announces each choice ("Liked Heat"). While a decision is pending, further input is ignored (no double decision). After a decision, focus moves to the new card, or to the same button on the new card when a button made the decision.
- **AC-13**: With `prefers-reduced-motion: reduce`, the card exit, the spring back, the deck advance and the reason reveal do not animate, and every flow still works.
- **AC-14**: `EmptyState`, `ErrorState` and `LoadingState` exist. The error state is a client component with `role="alert"` and a "Try again" button that calls `onRetry`. The empty state's action is `{href, label}`. The loading state shows static skeletons plus a status message for screen readers. Copy follows the voice rules in this spec.
- **AC-15**: The signed out page at `/` has, in its first viewport, the Moviz wordmark at hero size, one headline, one short line, one call to action group ("Start swiping" and "Sign in"), and one dominant poster (loaded with `fetchPriority="high"`) showing its title and year, with a sample reason. A visually hidden "Example pick:" precedes the reason for screen readers. It has no stats, badges or card grid. The poster comes from the catalog (fixed picks). If the catalog is empty, unavailable, or not reachable at build time, the page still renders, with an empty poster frame that carries the sample reason.
- **AC-16**: Layout rules hold at 320, 360, 768 and 1280 pixels wide, with no horizontal scroll at 320 and reflow at 400 percent zoom. Landing: below 1024px the DOM and visual order is wordmark, headline, line, buttons, poster; from 1024px the text column sits left and the poster right, in the same DOM order. Feed: every width shows the same `FeedItem` in the grid in this spec (one column, then more as space allows). Swipe: the same stack of poster, meta line and three buttons at every width.
- **AC-17**: A `/design` page renders every component in every state for review. It returns a 404 when `VERCEL_ENV` is `production`, and is available in development and on preview deployments.
- **AC-18**: A Playwright test runs an axe scan on `/` and `/design` and finds no serious or critical violations.
- **AC-19**: Motion is limited to the three named moments in this spec plus 120ms state changes. All durations come from the three motion tokens. A test searches `src/ui` for `@keyframes`, `animate-`, `transition` and `duration` and fails on any use outside the tokens and the exempt shadcn Sonner file.

## Decision

**Chosen option**: Option 1: Restyle shadcn/ui on a custom token layer called "the subtitle line"

Moviz keeps shadcn/ui (spec 0001) but replaces its look with the tokens below, builds its own movie and swipe components on top, and treats the reason line as the signature element: yellow subtitle text on the poster.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) · `tailwindcss` (`hairyf/skills`, `.claude/skills/tailwindcss/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.claude/skills/nextjs-app-router-patterns/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `typescript-advanced-types` (`wshobson/agents`, `.claude/skills/typescript-advanced-types/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.claude/skills/playwright-best-practices/`)

## Rationale

Reasoning and options: see [rationale.md](./rationale.md).

## Feature design

**Data model sketch**: none. This feature adds no tables and no migration. It reads the catalog through existing functions only.

**State transitions**: `SwipeCard` only: `idle` → `dragging` (pointer down on the poster and moved past 12px) → `committing` (threshold passed, or a button or key used) → `idle` on the next movie. Release below the threshold, or `pointercancel`, goes `dragging` → `idle` and the card returns. `committing` ignores all input. It ends when `movie.id` changes (the parent keys the deck on `movie.id`, so the new card mounts), or when `pending` goes from true to false with the same movie (the save failed): then the card springs back to `idle`. `onDecide` is called when the exit starts, not after it ends.

### Locked tokens

All tokens live in `src/app/globals.css` (Tailwind 4 `@theme`) and are the one source of truth. No component hardcodes a hex value.

**Color** (dark only; ratios were computed against Pit):
| Token | Hex | Role | Contrast |
|---|---|---|---|
| `--color-pit` | `#170B10` | page background | base |
| `--color-curtain` | `#26121A` | raised surfaces: inputs, toasts, empty frames | base |
| `--color-screen` | `#EFE9DF` | main text, focus ring | 15.9 on Pit |
| `--color-dust` | `#B8A5AC` | secondary text | 8.3 on Pit, 7.6 on Curtain |
| `--color-subtitle` | `#F5D547` | reason lines, primary button fill, active states | 13.3 on Pit |
| `--color-exit` | `#FF7A6B` | errors and destructive actions only | 7.5 on Pit |
| `--color-edge` | `#8F7480` | borders of inputs and secondary buttons | 4.6 on Pit, 4.2 on Curtain (needs 3.0) |

Derived tokens (exact CSS, no new hex):
- `--surface-hover: color-mix(in oklab, var(--color-screen) 8%, var(--color-curtain))`
- `--primary-hover: color-mix(in oklab, var(--color-subtitle) 90%, white)`
- `--primary-pressed: color-mix(in oklab, var(--color-subtitle) 90%, black)`
- `--bar-bg: color-mix(in srgb, var(--color-pit) 88%, transparent)` (the subtitle bar). Subtitle text on it measures 9.8:1 over a pure white poster pixel, and better over anything darker.
- `--glow-drag: 0 0 48px color-mix(in srgb, var(--color-subtitle) 14%, transparent)` (the only shadow; swipe card while dragging).

**shadcn semantic variables** (so generated components pick up the look): `background`=Pit, `foreground`=Screen, `card` and `popover`=Curtain, `card-foreground`=Screen, `primary`=Subtitle, `primary-foreground`=Pit, `secondary`, `muted` and `accent`=Curtain, `secondary-foreground` and `accent-foreground`=Screen, `muted-foreground`=Dust, `destructive`=Exit, `border` and `input`=Edge, `ring`=Screen.

**Type**: two families, loaded with `next/font/google` as CSS variables (`Archivo` with `axes: ["wdth"]` and `Atkinson_Hyperlegible_Next`; both exist in the installed Next version's font typings).
- Archivo, variable, width axis (`wdth`) and weight, for the wordmark and headlines.
- Atkinson Hyperlegible Next, variable weight, for everything else.

| Style | Family and setting | Size and line height |
|---|---|---|
| Wordmark | Archivo, width 125, weight 800, tracking −0.02em | `clamp(4.5rem, 16vw, 9rem)` / 0.9 |
| Headline (h1) | Archivo, width 112, weight 800 | `clamp(2rem, 6vw, 3.5rem)` / 1.05 |
| Section title (h2) | Archivo, width 100, weight 700 | 1.75rem / 1.2 |
| Movie title | Atkinson, weight 700 | 1.0625rem / 1.3 |
| Body | Atkinson, weight 400 | 1rem / 1.6 |
| Reason (subtitle) | Atkinson, weight 500, Subtitle color | 1.0625rem / 1.4 |
| Small | Atkinson, weight 400, Dust color | 0.875rem / 1.45 |

Rules: sentence case everywhere, no all caps, no eyebrow labels above headings, no monospace labels. Body line length at most 62 characters (`max-w-[62ch]`). Smallest text is 14px.

**Spacing and layout**: 4px base. Allowed steps: 4, 8, 12, 16, 24, 32, 48, 64, 96. Page gutter 16px under 640px, 24px from 640px, 32px from 1024px. Content container max width 1120px, left aligned. The one centered exception is the swipe deck, which is a single object.

**Shape**: posters and the subtitle bar 2px radius (a film frame); controls (buttons, inputs) 6px; toasts and sheets 10px. No drop shadows anywhere. Depth comes from surface color. The single exception is a faint yellow glow on the swipe card while it is being dragged (`0 0 48px` Subtitle at 14%).

**Motion** (tokens: `--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)`, `--dur-state: 120ms`, `--dur-reveal: 240ms`, `--dur-card: 220ms`). The three moments, and nothing else:
1. **Swipe response**: the card follows the pointer with up to 8° tilt, the subtitle bar swaps to the pending action word past 40% of the threshold, and on commit the card leaves in the drag direction over `--dur-card`.
2. **Reason reveal**: when a feed item scrolls into the viewport after the page has hydrated, its subtitle bar wipes in from left to right over `--dur-reveal`, once per item. Items already in view at hydration do not animate, so there is no flash. Content is visible without JavaScript (the hidden state is added by script, and only for items below the fold).
3. **Deck advance**: the next swipe card scales from 0.97 to 1 and fades in over `--dur-card`.
Color changes on hover, focus and press take `--dur-state`. The Skeleton is static (no pulse). Sonner's own animations are left as shipped, and that one file is exempt from AC-19. With `prefers-reduced-motion: reduce`, moments 1 (exit only), 2 and 3 are skipped, and drag still follows the pointer.

**Focus and keyboard**: one global rule: `:focus-visible { outline: 3px solid var(--color-screen); outline-offset: 3px; }`. It uses `outline`, so it survives forced colors mode. Interactive targets are at least 44×44px. The swipe card is a focusable group; arrow keys act only when the card itself has focus, not when a button inside it does.

**Voice**: sentence case, plain verbs, active voice, an action keeps one name through the flow ("Like" button, "Liked Heat" announcement). Errors say what happened and how to fix it, with no apology. Empty states invite the next action.

### Components

All new code lives in `src/ui/` (one feature folder, per the folder by feature rule). shadcn output goes in `src/ui/primitives/`, and `components.json` points its aliases there.

| Component | File | Props (key ones) | Notes |
|---|---|---|---|
| `Button`, `Input`, `Label`, `Skeleton`, `Toaster` | `src/ui/primitives/` | shadcn defaults, restyled | Button variants: primary (Subtitle fill, Pit text), secondary (Edge border), ghost, destructive (Exit text, Edge border). Sizes: default 44px, large 48px, icon 44×44. |
| `Field` | `src/ui/field.tsx` | `label`, `hint?`, `error?`, input props | Generates ids; `aria-describedby` lists hint then error; `aria-invalid` when `error` is set. |
| `SiteShell pieces` | `src/app/layout.tsx`, `src/ui/skip-link.tsx` | none | The root layout renders the skip link, `<main id="main-content" tabIndex={-1}>`, the Toaster and the TMDB footer once. Not an `AppShell` wrapper, so the footer is never doubled. |
| `SiteHeader` | `src/ui/site-header.tsx` | `links: {href, label}[]` | Wordmark link plus a nav list. `NavLinks` is a small client component that marks the current page. Route group layouts (feed, swipe) render it; `/` does not. |
| `PosterImage` | `src/ui/poster-image.tsx` | `src`, `alt`, `width`, `height`, `title`, `priority?` | Client component. Shows the Curtain title frame on `onError`, and also on mount when the image is already broken (`complete` with `naturalWidth` 0). `priority` sets `fetchPriority="high"`. |
| `MovieCard` | `src/ui/movie-card.tsx` | `movie: {id, title, releaseYear, posterPath, genres}`, `reason?`, `href?`, `posterSize?` | Server component. Meta line "{year}, {first two genres}", missing parts dropped. With `href`, the title is the link and the whole card is clickable (stretched link). DOM order: poster, reason, title, meta. |
| `FeedItem` | `src/ui/feed-item.tsx` | same as `MovieCard`, `reason` required | Wraps `MovieCard` (size `w500`) with the reason reveal (client component `ReasonReveal`). |
| `SwipeCard` | `src/ui/swipe-card/` | `movie`, `onDecide(choice: SwipeChoice)`, `pending?`, `announce(message)` | `SwipeChoice` is the existing type from `src/ratings/swipe-score.ts`. The parent keys the card on `movie.id` and owns an always mounted live region that `announce` writes to (a small `SwipeDeck` wrapper provides both). Does not save anything; the onboarding feature wires `saveSwipe`. |
| `decideFromDrag` | `src/ui/swipe-card/decide-from-drag.ts` | `{dx, dy, vx, vy, width, height}` | Returns `SwipeChoice \| null`. Pure and unit tested. |
| `EmptyState` | `src/ui/states/empty-state.tsx` | `title`, `body`, `action?: {href, label}` | Server component. |
| `ErrorState` | `src/ui/states/error-state.tsx` | `title`, `body`, `onRetry` | `"use client"`. Callers are client components or an `error.tsx`. |
| `LoadingState` | `src/ui/states/loading-state.tsx` | `label` | Static skeletons and a visually hidden status message. |
| `Hero` | `src/ui/landing/hero.tsx` | `pick: HeroPick \| null` | Landing only. `HeroPick = { movie: Pick<CatalogMovie, "id" \| "title" \| "releaseYear" \| "posterPath">; reason: string }`. |
| `loadHeroPick` | `src/ui/landing/load-hero-pick.ts` | `db` | Returns `Promise<HeroPick \| null>`. Treats `no_match` and `ambiguous` as a skip, and a database error or a throw as `null`. |

**Swipe card details**:
- Thresholds (constants in `src/ui/swipe-card/constants.ts`): the axis locks after 12px of movement and the decision uses the locked axis. Commit when the dragged distance is at least `max(96px, 30% of card width)` to the right or left, or `max(96px, 25% of card height)` upward, or when a flick has speed of at least 0.6px/ms (measured over the last 100ms) over at least 40px along the locked axis. A downward drag never commits. Tilt reaches 8° at the threshold and is clamped there.
- `touch-action: none` is set on the poster only, not the whole card. The page can still scroll with a finger on the buttons or text, so the screen works on landscape phones and at 400 percent zoom. The poster is sized `max-height: min(60dvh, 560px)`.
- Pointer down on a button never starts a drag.
- At rest the poster has no subtitle bar. While dragging past 40% of the threshold, a bar shows the pending word ("Like", "Dislike", "Not seen") in Screen color (not yellow, since it is an action, not a reason).
- Buttons: all three use the secondary variant (Edge border). Icons from `lucide-react`: `ThumbsDown`, `EyeOff`, `ThumbsUp`. Order left to right: Dislike, Not seen, Like.
- The hint text "Use arrow keys or the buttons" is visible under the buttons in Small style, and referenced with `aria-describedby`.

**Copy** (first draft; the screens that own them may refine within the voice rules):
- Landing headline "Picks that say why." Line: "Swipe a few movies you know. Every pick Moviz makes comes with its reason." Buttons: "Start swiping", "Sign in". Sample reason: "Because you rated Heat highly."
- Empty feed: title "No picks yet", body "Swipe a few movies and your first picks show up here." Action "Start swiping".
- Error: title "Couldn't load your picks", body "Check your connection and try again." Action "Try again".
- Loading status (screen readers): "Loading your picks".
- Swipe announcements: "Liked {title}", "Disliked {title}", "Marked {title} as not seen".

### Wireframes

Phone first; the wider layouts keep the same composition.

**Signed out landing** (`/`, no header, left aligned)
```
360 wide                           1280 wide
+------------------------+         +---------------------------------------------+
| Moviz                  |         | Moviz                    +-----------+      |
| (hero size wordmark)   |         | (hero size wordmark)     |           |      |
|                        |         |                          |  poster   |      |
| Picks that say why.    |         | Picks that say why.      |           |      |
| Swipe a few movies you |         | Swipe a few movies you   |           |      |
| know. Every pick Moviz |         | know. Every pick Moviz   |           |      |
| makes comes with its   |         | makes comes with its     | Because   |      |
| reason.                |         | reason.                  | you rated |      |
| [Start swiping]        |         | [Start swiping] Sign in  | Heat ...  |      |
| Sign in                |         |                          +-----------+      |
| +--------------------+ |         +---------------------------------------------+
| |  poster (top shown | |
| |  in first screen)  |         The poster is the same object in both: text
| | Because you rated  |         column on the left, poster on the right once
| | Heat highly.       |         there is room. The subtitle bar sits on the
+------------------------+         bottom of the poster.
```

**Swipe onboarding** (centered deck, fits one viewport)
```
+------------------------+   at 1280 the same stack sits centered,
| Moviz            (nav) |   poster at most 60dvh tall
|                        |
| +--------------------+ |
| |                    | |   while dragging, the subtitle bar
| |      poster        | |   shows: "Like" / "Dislike" / "Not seen"
| |                    | |
| | [ Like          ]  | |
| +--------------------+ |
| Collateral, 2004       |
| [Dislike][Not seen][Like]   three labelled buttons, always visible
+------------------------+
```

**Personalized feed** (reel of frames; no card chrome, the poster is the frame)
```
360 wide                  768 wide                     1280 wide
+----------------+        +----------------------+     +-----------------------------------+
| Moviz   (nav)  |        | Moviz         (nav)  |     | Moviz                      (nav)  |
| +------------+ |        | +--------+ +--------+|     | +------+ +------+ +------+        |
| |  poster    | |        | | poster | | poster ||     | |poster| |poster| |poster|        |
| | reason bar | |        | | reason | | reason ||     | |reason| |reason| |reason|        |
| +------------+ |        | +--------+ +--------+|     | +------+ +------+ +------+        |
| Title          |        | Title      Title     |     | Title    Title    Title           |
| 1995, Crime    |        | 1995       2004      |     | ...                               |
| +------------+ |        +----------------------+     +-----------------------------------+
| |  poster    | |
```
The feed is a CSS grid, `repeat(auto-fill, minmax(min(100%, 260px), 1fr))`, in the 1120px container. On one column an item is at most 420px wide. Row gap 32px, column gap 24px.

**API surface**: no new endpoints, Server Actions or Route Handlers. The component props above are the interface other features call.

**Value sourcing** (every value each action produces or displays, with its source):
| Action | Value produced / displayed | Source |
|---|---|---|
| Show a poster | image address | `posterUrl(movie.posterPath, size)` from `src/catalog/images.ts` (`w342` default, `w500` on feed items, the swipe card and the hero; `unoptimized` gives no `srcset`, so the larger size keeps 2x screens sharp) |
| Show a poster | width and height | `POSTER_DIMENSIONS[size]` from `src/catalog/images.ts` |
| Show a poster | alt text | built as "Poster for {movie.title}" |
| Show title, year, genres | text | `CatalogMovie.title`, `releaseYear`, `genres` from `getMoviesByIds` |
| Show a reason | the sentence | `reason` prop. Feed: produced by spec 8 and used in spec 9. Landing: `HERO_PICKS[n].reason` in `src/ui/landing/hero-picks.ts` |
| Choose the hero movie | which movie | `HERO_PICKS` (title, year pairs: Collateral 2004 with reason "Because you rated Heat highly."; Blade Runner 2049 (2017) with reason "Because you rated Blade Runner highly."). Resolved with `matchMovies`, then `getMoviesByIds`. First match that has a poster wins. Cached with `export const revalidate = 3600` on `/` (`cacheComponents` is not enabled in `next.config.ts`). If the build runs with no database, the page prerenders the empty frame and refreshes within the hour |
| Commit a swipe | the choice | button pressed, key pressed, or `decideFromDrag(...)` result, typed as `SwipeChoice` |
| Announce a swipe | "Liked {title}" | derived from the choice and `movie.title` |
| Mark current page in nav | which link is current | `usePathname()` inside `NavLinks`, compared with `links[].href` |
| Show nav links | the list | `links` prop from the layout of the feature that owns the screen |
| Landing buttons | destinations | constants `SIGN_UP_PATH = "/sign-up"` and `SIGN_IN_PATH = "/sign-in"` in `src/ui/landing/paths.ts`. These pages arrive with spec 6; until then the links lead to a 404 |
| Browser color | theme color | `viewport.themeColor` set to Pit; `viewport.colorScheme` set to `dark` |
| Style guide gating | is production | `VERCEL_ENV` (optional) parsed in `src/env.ts` and listed in `.env.example`. The page 404s when it equals `production`. Previews and local runs show it. The check is a small pure function `isDesignPageHidden(vercelEnv)` with a unit test |
| Hero context for screen readers | "Example pick:" | fixed visually hidden text before the sample reason |
| Hero title and year | text shown under the poster | `HeroPick.movie.title` and `releaseYear` |
| Meta line | "{year}, {genres}" | `movie.releaseYear` and the first two of `movie.genres`; a null year or empty genres is dropped |
| Swipe card name and hint | "{title}, {year}" and the hint | `movie.title`, `movie.releaseYear`; fixed hint text |

**Key invariants**:
- No component contains a hex value or a hardcoded font name. They use tokens only.
- Every swipe outcome reachable by gesture is reachable by a labelled button and by a key.
- A reason is never truncated or hidden behind a tap.
- Yellow (Subtitle) marks a reason or the next step, and nothing else. Red (Exit) marks an error or a destructive action, and nothing else.
- The movie shown by any list or deck has passed the listable rule (spec 0003); the components do not re check it.

**Security model**: all pages and components are public and hold no user data. The landing page reads only public catalog rows on the server. `/design` is hidden in production. Ratings and reasons never go to analytics or logs from these components.

**Configuration required**: `VERCEL_ENV` (optional string, set by Vercel; parsed in `src/env.ts`, added to `.env.example`), used only to hide `/design` in production. New dependencies (versions pinned by pnpm): `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, and the Radix package that the current `shadcn` init selects.

**Critical test scenarios** (each maps to an acceptance criterion):
- Contrast: every pair listed in AC-3 passes its limit (the subtitle bar over pure white and pure black included), and a deliberately darkened Dust fails the test, verifies **AC-3**, **AC-9**
- Tokens: `globals.css` has no `prefers-color-scheme` block, no Geist and no Arial, and defines every token and shadcn variable in this spec (a unit test reads the file), verifies **AC-1**
- Design doc: `design.md` exists and mentions every token name and component name in this spec (a unit test reads both), verifies **AC-2**
- Fonts and layout shift: Playwright measures a layout shift score of 0 on `/` and checks the wordmark computed font family is Archivo, verifies **AC-4**
- Primitives: a Vitest render test checks Button variants and 44px sizes, `Field` ids and `aria-describedby` and `aria-invalid`, verifies **AC-6**
- Layout pieces: a render test shows the root layout has exactly one skip link, one `main` and one footer, and `SiteHeader` marks `aria-current` on the matching link, verifies **AC-7**
- Hero data: `loadHeroPick` with a fake db returns the first pick that has a poster, skips `no_match` and `ambiguous`, and returns `null` on a database error or a throw; `Hero` renders a fixed pick and the `null` case (empty frame plus the sample reason), verifies **AC-15**
- Happy path: with the catalog data faked, `/` shows the wordmark, headline, both buttons, the poster and the hidden "Example pick:" text, verifies **AC-15**
- Failure case: a movie with `posterPath: null` and one with a poster that fails to load (including before hydration) both render the title frame, verifies **AC-8**
- Swipe with no drag: clicking each of the three buttons calls `onDecide` once with the right value, verifies **AC-10**
- Swipe by drag: a pure test of `decideFromDrag` for right, left, up, down, a short drag, a fast flick and a diagonal drag; a browser test with dispatched pointer events for mouse, touch and pen, verifies **AC-11**
- Keyboard: focus the card, press ArrowRight, and `onDecide("liked")` runs once, the live region says "Liked {title}", and focus lands on the new card; ArrowUp does not scroll; pressing twice quickly while committing runs it once; a failed save (`pending` true then false, same movie) returns the card, verifies **AC-12**
- Reduced motion: with the preference on, no exit animation runs and the choice still commits, verifies **AC-13**
- States: `ErrorState` has `role="alert"` and "Try again" calls `onRetry`; `EmptyState` renders its link; `LoadingState` has a status message, verifies **AC-14**
- Long reason: a 200 character reason shows in full inside the bar, verifies **AC-9**
- Responsive: at 320, 360, 768 and 1280 pixels there is no horizontal scroll, and the landing DOM and placement rules in AC-16 hold, verifies **AC-16**
- Accessibility: axe scan of `/` and `/design` has no serious or critical issues; Tab from the top reaches the skip link first, verifies **AC-5**, **AC-18**
- Gating: the unit test for `isDesignPageHidden("production")` is true and other values false; a Playwright run against `pnpm build && pnpm start` with `VERCEL_ENV=production` gets 404 on `/design`, verifies **AC-17**
- Motion budget: the search test over `src/ui` finds no `@keyframes`, `animate-`, `transition` or `duration` outside the tokens and the Sonner file, verifies **AC-19**

## Build plan

Approach: Tracer Bullet. The first task cuts one thread through every layer (tokens, fonts, shadcn, shell, catalog read, landing page). Later tasks thicken one strand at a time.

1. [x] **Thread: tokens, fonts, layout pieces and landing.** Rewrite `globals.css` with the tokens, add the Archivo and Atkinson fonts, make the root layout dark only with the viewport settings, run `shadcn init` (adds `components.json`, `cn`, dependencies) and add `Button`. Add the skip link, `main` and the restyled TMDB footer to the root layout (once), and `SiteHeader`. Update the two existing tests that this changes: `e2e/tmdb-footer.spec.ts` (drop the light and dark color scheme loop) and `src/catalog/tmdb-attribution.test.tsx` (new markup). Build `Hero` with `loadHeroPick` (fixed picks through the catalog, `revalidate = 3600`) and the empty frame fallback, and replace the placeholder `/`. Confirm `pnpm build` passes with no `DATABASE_URL` set, as CI does; if the database module throws on import, make the hero read tolerate that. Satisfies **AC-1**, **AC-4**, **AC-5**, **AC-7**, **AC-15**
2. **Contrast guard.** Unit test that parses the color tokens from `globals.css` and checks every pair in the table. Satisfies **AC-3**
3. **Remaining primitives and states.** Add `Input`, `Label`, `Skeleton`, `Sonner` through shadcn and restyle; write `Field`, `EmptyState`, `ErrorState`, `LoadingState`. Add the `/design` page (gated) showing every component and state. Satisfies **AC-6**, **AC-14**, **AC-17**
4. **Movie card and feed item.** `PosterImage`, `MovieCard` with poster, fallbacks and the subtitle bar; `FeedItem` with `ReasonReveal`; `MovieCardSkeleton`. Add both to `/design`, including the 200 character reason. Satisfies **AC-8**, **AC-9**, **AC-13**, **AC-19** (for these pieces)
5. **Swipe card.** First the `SwipeDeck` wrapper (keyed card, live region), the three labelled buttons and the focus handling; then `decideFromDrag` with its unit test; then pointer gestures, drag feedback and the exit, spring back and advance motion; then keyboard handling and the pending guard. Add to `/design` with a stub `onDecide`. Satisfies **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-19**
6. **Tests and gates.** Add `VERCEL_ENV` to `src/env.ts` and `.env.example`, `isDesignPageHidden` and its test, the motion search test, and Playwright specs for `/` and `/design`: axe scan, skip link first, layout shift, widths, dispatched pointer drags, keyboard swipe, and a `pnpm build && pnpm start` run for the `/design` 404. Note that CI does not run Playwright yet (root `AGENTS.md`), so AC-17 and AC-18 are enforced locally until it does. Satisfies **AC-16**, **AC-17**, **AC-18**
7. **Write `design.md`.** At the repo root, from the finished build (so it matches reality), covering everything in AC-2. After this, `design.md` is the living reference and this spec stays the decision record. Satisfies **AC-2**

## Consequences

**Positive**:
- Every later screen assembles from locked tokens and components, so no feature spends time on look or invents a one off style.
- Accessibility is built into the primitives (focus, targets, labels, live region) rather than checked at the end. The final pass (feature 18) starts from a clean base.
- The contrast test makes the palette safe to change later: a bad token edit fails a test.
- The signature (reasons as subtitles) matches the product promise, so the look and the product explain each other.

**Negative / tradeoffs**:
- Dark only. People who need a light screen have no option, and bright rooms are less comfortable. A light theme would need a second, equally tested palette.
- Posters come from TMDB, so the look depends on their art and on TMDB availability. The title frame fallback keeps pages usable but plain.
- Both fonts are web fonts (a small download on first visit). Variable fonts keep this to two files.
- The swipe card needs JavaScript to work, including the buttons, because decisions go through `onDecide`. The onboarding feature may add a no script path if it wants one.
- A custom gesture implementation means this repo owns edge cases (pointer cancel, scroll conflicts). The unit and browser tests are the safety net.
- Landing buttons point to `/sign-up` and `/sign-in`, which do not exist until spec 6, so they lead to a 404 until then.

**Neutral**:
- Adds five small dependencies and a `src/ui/` folder.
- The scaffold's Geist fonts and light default colors are removed.
- `design.md` becomes a second place that describes the look. The tokens in `globals.css` stay the only source of values.

## Follow-up

- [ ] CI does not run Playwright yet, so the axe scan, layout shift and `/design` 404 checks are not enforced there. Consider adding Playwright to CI.
- [ ] Verify the hero titles (Collateral 2004, Blade Runner 2049) exist in the seeded catalog with posters; change `HERO_PICKS` if not.
- [ ] Check TMDB's rules for showing a poster as a marketing hero (spec 0003 notes a separate agreement is needed for commercial use). Moviz is free today; revisit if that changes.
- [ ] Spec 6 (email sign in) owns `/sign-up` and `/sign-in`, redirecting a signed in user away from `/`.
- [ ] Spec 7 (swipe onboarding) wires `SwipeCard` to `saveSwipe`, adds the undo toast, and decides the deck length and the stop point.
- [ ] Spec 9 (feed) supplies the `reason` text and decides how a failed feed load is retried.
- [ ] Spec 18 (accessibility pass) should re run the contrast test and a screen reader check on the swipe card.
- [ ] `/sync` should add `design.md` and `src/ui/AGENTS.md` to the Context files in root `AGENTS.md`, and the `frontend-design` plugin skill to the Agent skills list.

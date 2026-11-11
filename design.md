# Moviz design system: "the subtitle line"

This is the living reference for how Moviz looks and behaves. The decision record is [spec 0004](docs/specs/0004-design-system-ui-foundation/index.md). The tokens in `src/app/globals.css` are the only source of values. This file explains them and the components built on them. When the two disagree, the CSS wins, and this file should be fixed.

You can see every token and component in every state at `/design` while you run the app (it returns a 404 in production).

## The idea

Moviz has one promise: every pick says why. Film already has a form for words over an image, the subtitle. So the reason for each pick is set like a film subtitle, in yellow, on the poster. Everything else stays quiet so the posters carry the color.

Three rules follow from that:

- Yellow (Subtitle) marks a reason or the next step, and nothing else.
- Red (Exit) marks an error or a destructive action, and nothing else.
- A reason is never cut off and never hidden behind a tap.

## Dark only

Moviz is dark only. A dark room suits posters, and one palette means half the contrast testing and no theme switch. The page sets `color-scheme: dark`, has no `prefers-color-scheme` block, and tells the browser its theme color is Pit. People who need a light screen have no option today. Adding one would need a second palette with its own contrast test.

## Color

Seven colors. They are defined once in `src/app/globals.css`, and no component uses a hex value. Tailwind's own palette is turned off, so a class like `bg-blue-500` does nothing.

| Token              | Role                                          | Used for                                       |
| ------------------ | --------------------------------------------- | ---------------------------------------------- |
| `--color-pit`      | Page background                               | `bg-pit`, `bg-background`                      |
| `--color-curtain`  | Raised surfaces                               | Inputs, toasts, empty frames, poster fallbacks |
| `--color-screen`   | Main text and the focus ring                  | `text-foreground`                              |
| `--color-dust`     | Secondary text                                | Hints, meta lines, small text                  |
| `--color-subtitle` | Reasons, the primary button, the current page | `bg-primary`, reason text                      |
| `--color-exit`     | Errors and destructive actions only           | `text-destructive`, invalid borders            |
| `--color-edge`     | Borders of inputs and secondary buttons       | `border-border`, `border-input`                |

Derived tokens, made with `color-mix` and no new hex values:

| Token               | Meaning                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `--surface-hover`   | Screen at 8% over Curtain. Hover surface for secondary and ghost buttons                    |
| `--primary-hover`   | Subtitle at 90% over white                                                                  |
| `--primary-pressed` | Subtitle at 90% over black                                                                  |
| `--bar-bg`          | Pit at 88% opacity. The subtitle bar background                                             |
| `--glow-drag`       | A faint yellow glow, the only shadow in the app. Used on the swipe card while it is dragged |

shadcn variable mapping, so generated components pick up the look: `background` is Pit, `foreground` is Screen, `card` and `popover` are Curtain, `primary` is Subtitle, `primary-foreground` is Pit, `secondary`, `muted` and `accent` are Curtain, `muted-foreground` is Dust, `destructive` is Exit, `border` and `input` are Edge, `ring` is Screen.

### Contrast

Text pairs meet 4.5 to 1, and control borders meet 3 to 1. `src/ui/contrast.test.ts` reads the colors from `globals.css` and checks every pair, so a token edit that breaks one fails the test. The pairs are Screen, Dust, Subtitle and Exit on Pit and on Curtain, Pit on Subtitle (the primary button), Dust and Screen on the hover surface, Edge on Pit, Curtain and the hover surface, and Subtitle on the subtitle bar over both a pure white and a pure black poster.

## Type

Two families, loaded with `next/font/google` in the root layout.

- **Archivo**, variable, with its width axis. The wordmark and headlines.
- **Atkinson Hyperlegible Next**, variable weight. Everything else.

Type styles are named utilities in `globals.css`:

| Utility         | Family and setting                             | Size and line height              |
| --------------- | ---------------------------------------------- | --------------------------------- |
| `type-wordmark` | Archivo, width 125, weight 800, tight tracking | `clamp(4.5rem, 16vw, 9rem)` / 0.9 |
| `type-brand`    | Same as the wordmark, small                    | 1.5rem / 1.1 (header and footer)  |
| `type-headline` | Archivo, width 112, weight 800                 | `clamp(2rem, 6vw, 3.5rem)` / 1.05 |
| `type-section`  | Archivo, width 100, weight 700                 | 1.75rem / 1.2                     |
| `type-title`    | Atkinson, weight 700                           | 1.0625rem / 1.3                   |
| (body)          | Atkinson, weight 400                           | 1rem / 1.6                        |
| `type-reason`   | Atkinson, weight 500, Subtitle color           | 1.0625rem / 1.4                   |
| `type-small`    | Atkinson, weight 400, Dust color               | 0.875rem / 1.45                   |

Rules: sentence case everywhere, no all caps, no small labels above headings, no monospace labels. Body lines stop at 62 characters (`max-w-[62ch]`). The smallest text is 14px.

## Spacing, layout and shape

- **Spacing** is a 4px base. Allowed steps: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- **Container**: `page-container`, left aligned, 1120px wide, with gutters of 16px (under 640px), 24px (from 640px) and 32px (from 1024px). The swipe deck is the one centered object, because it is a single card.
- **Shape**: posters and the subtitle bar have a 2px radius (`rounded-poster`, a film frame). Buttons and inputs have 6px (`rounded-control`). Toasts and panels have 10px (`rounded-sheet`).
- **Depth** comes from surface color. There are no shadows, except the drag glow.
- **Feed grid**: the `feed-grid` utility, `repeat(auto-fill, minmax(min(100%, 260px), 1fr))`, 32px between rows and 24px between columns. On one column an item is at most 420px wide.
- **Detail grid**: the `detail-grid` utility, for the movie detail page. One column with 32px between the poster and the text, and a poster at most 420px wide. From 1024px, two columns with 48px between them: the poster on the left at 40% of the row up to 420px, the text on the right.

## Motion

Three moments, and nothing else. All durations are tokens in `globals.css`, and all motion rules live there too, so components only name a class. `src/ui/motion-budget.test.ts` fails if a component file starts an animation of its own (the Sonner file is exempt).

| Token          | Value                                                           |
| -------------- | --------------------------------------------------------------- |
| `--ease-out`   | `cubic-bezier(0.2, 0.8, 0.2, 1)`                                |
| `--dur-state`  | 120ms. Color changes on hover, focus and press (`state-change`) |
| `--dur-reveal` | 240ms. The reason wipe                                          |
| `--dur-card`   | 220ms. Swipe exit, return and deck advance                      |

1. **Swipe response.** The card follows the pointer, tilts up to 8 degrees, shows the pending action word past 40% of the commit distance, and leaves in the direction of the choice.
2. **Reason reveal.** When a feed item scrolls into view after the page has loaded, its subtitle bar wipes in left to right, once. Items already in view at load do not animate, so nothing flashes. Without JavaScript the bar is simply visible.
3. **Deck advance.** The next swipe card scales from 0.97 to 1 and fades in.

With `prefers-reduced-motion: reduce`: the exit, the return, the reveal and the advance do not animate, and every flow still works. Dragging still follows the pointer. The skeleton never pulses.

## Focus and keyboard

- One global rule: `:focus-visible { outline: 3px solid var(--color-screen); outline-offset: 3px; }`. It uses `outline`, so it also shows in forced colors mode.
- Every interactive target is at least 44px high.
- "Skip to content" is the first stop on every page and moves focus to `main`.
- The swipe card is a focusable group. Arrow keys act only when the card itself has focus, never when a button inside it does. Keys with a modifier are ignored, so browser shortcuts still work.
- Tab order follows visual order.

## Voice

Sentence case, plain verbs, active voice. An action keeps one name through the whole flow: the "Like" button, then the announcement "Liked Heat". Errors say what happened and how to fix it, with no apology. Empty states invite the next action.

- Landing: "Picks that say why." and "Swipe a few movies you know. Every pick Moviz makes comes with its reason."
- Empty feed: "No picks yet", "There are no movies to suggest right now. Check back soon." No action, because a finished user cannot reopen the swipe deck.
- Error: "Couldn't load your picks", "Check your connection and try again."
- Loading status for screen readers: "Loading your picks".
- Swipe announcements: "Liked {title}", "Disliked {title}", "Marked {title} as not seen".

## Components

Everything lives in `src/ui/`. shadcn output is in `src/ui/primitives/` and was restyled to the tokens. `components.json` points its aliases there.

### Primitives (`src/ui/primitives/`)

- **Button**: variants `primary` (Subtitle fill, Pit text), `secondary` (Edge border), `ghost`, `destructive` (Exit text, Edge border). Sizes `default` (44px), `large` (48px), `icon` (44 by 44). `asChild` renders a link with button styling. States: default, hover, pressed, focus, disabled.
- **Input**: Curtain surface, Edge border, 44px high. A red border when `aria-invalid`.
- **Label**: always paired with a control through `htmlFor`.
- **Skeleton**: a static Curtain block, hidden from screen readers.
- **Toaster** (Sonner): bottom center, dark, with a visible close button.

### Shared pieces (`src/ui/`)

- **Field** (`field.tsx`): label, input, optional hint and error. Generates ids, lists the hint then the error in `aria-describedby`, and sets `aria-invalid` while there is an error.
- **FileField** (`file-field.tsx`): a `Field` with `type="file"`. The native "Choose file" button is restyled to the tokens, and the label, hint and error are linked the same way.
- **CountTile** (`count-tile.tsx`): one number with its name on a Curtain surface. `CountTiles` wraps three of them in a description list. The Letterboxd import uses them for rows read, matched and not matched.
- **SkipLink** (`skip-link.tsx`): hidden until focused.
- **SiteHeader** and **NavLinks** (`site-header.tsx`, `nav-links.tsx`): the wordmark as a link home, then a navigation list. `NavLinks` is a small client component that marks the current page with `aria-current="page"`. Route group layouts render it; `/` does not.
- **SubtitleBar** (`subtitle-bar.tsx`): a reason set as a subtitle at the bottom of a poster frame.
- **PosterImage** (`poster-image.tsx`): a 2:3 poster through `next/image` with `unoptimized` (posters are hotlinked from TMDB). When the poster is missing or fails to load, even before the page loaded, it shows a Curtain frame with the title in Archivo at the top, so a reason bar never covers it.
- **MovieCard** (`movie-card.tsx`): poster, then reason, title and a meta line like "1995, Action, Crime". No box around it. With `href`, the title is the link and the whole card is clickable. The link does not prefetch. Poster size is `w342` by default. In the feed every card links to its movie page.
- **FeedItem** and **ReasonReveal** (`feed-item.tsx`, `reason-reveal.tsx`): a MovieCard at `w500` with a required reason, and the reveal motion.
- **MovieCardSkeleton** (`movie-card-skeleton.tsx`): the static placeholder for a card.

### Movie detail (`src/movie/`)

The page of one movie, `/movie/[id]` ([spec 0010](docs/specs/0010-movie-detail-page/index.md)). See the last wireframe below.

- **MovieDetailView** (`movie-detail-view.tsx`): the poster at `w500` with the reason in a SubtitleBar, then the title in `type-headline`, the meta line in Dust ("1995, 2h 50m, Crime, Drama"), the tagline in `type-title`, the synopsis, "Directed by" and its names, and the cast under a `type-section` heading. The cast is a plain list of up to 8 rows, "Name as Character", each with a Curtain rule above it, and no photos. A fact with no data is left out, with no placeholder. The reason is real page text, shown in full, and it does not animate: the reason reveal stays a feed only moment. With no reason there is no bar.
- **MovieDetailSkeleton** (`movie-detail-skeleton.tsx`): the static placeholder in the same two shapes. The page wraps it with the status text "Loading movie".
- **MovieNotFound** (`movie-not-found.tsx`): a Curtain panel with "Movie not found", one line of why, and the way back.
- **BackToPicks** (`back-to-picks.tsx`): a quiet Dust link with a left arrow, 44px high, above the poster. It is always a real link to `/home`. When the movie was opened from the feed, it steps back in history instead, so the feed shows where the user left it.
- The load error uses ErrorState with the words "We couldn't load this movie." The header and the back link stay above it.

### States (`src/ui/states/`)

- **EmptyState**: title, body and an optional action link.
- **ErrorState**: a client component with `role="alert"`, a title, a body and a "Try again" button that calls `onRetry`. The title is an `h2`, or the `h1` when the error is the only heading on the page (`titleAs`).
- **LoadingState**: static skeletons plus a status message for screen readers.

### Swipe (`src/ui/swipe-card/`)

- **SwipeCard**: one movie. Three labelled buttons always work with no drag: Dislike, Not seen, Like, each with an icon. Dragging the poster right likes, left dislikes and up marks not seen. A downward drag never decides. A drag locks to one axis after 12px and commits at the larger of 96px or 30% of the width (sideways), or the larger of 96px or 25% of the height (up). A flick of at least 0.6px per millisecond over at least 40px also commits. While dragging past 40% of the distance, a bar shows the action word in Screen color. Arrow keys do the same as the buttons when the card has focus. While a decision is pending, all input is ignored. If `pending` ends with the same movie, the card returns. `touch-action: none` is on the poster only, so the page still scrolls with a finger elsewhere.
- **decideFromDrag**: the pure function that turns a drag into a choice. Unit tested.
- **SwipeDeck**: keys the card on the movie, owns the always mounted live region, waits for the exit to finish before showing the next card, and moves focus to the new card (or to the same button after a button press).
- Constants are in `constants.ts`. `EXIT_MS` must equal `--dur-card`, and a test checks it.

### Landing (`src/ui/landing/`)

- **Hero**: the first screen of `/`. See the first wireframe below.
- **loadHeroPick**: finds the first of the fixed picks (`HERO_PICKS`) that the catalog holds with a poster. It skips a pick that is not found or is ambiguous, and returns `null` on any database failure, so the page still renders with an empty poster frame that carries the sample reason.

## Wireframes

Phone first. Wider layouts keep the same composition.

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
| |  in first screen)  |         The text column is on the left and the poster
| | Because you rated  |         on the right once there is room (1024px).
| | Heat highly.       |         The subtitle bar sits on the bottom of the
+------------------------+         poster. The page order is the same at both sizes.
```

**Swipe onboarding** (a centered deck, one object)

```
+------------------------+   at 1280 the same stack sits centered
| Moviz            (nav) |
|                        |
| +--------------------+ |   while dragging, the subtitle bar
| |                    | |   shows: "Like" / "Dislike" / "Not seen"
| |      poster        | |
| |                    | |
| | [ Like          ]  | |
| +--------------------+ |
| Collateral  2004       |
| [Dislike][Not seen][Like]   three labelled buttons, always visible
| Use arrow keys or the buttons
+------------------------+
```

**Personalized feed** (a reel of frames, no card chrome, the poster is the frame)

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

**Movie detail** (`/movie/[id]`, the poster keeps its reason, the facts read like end credits)

```
360 wide                      1280 wide
+------------------------+    +------------------------------------------------+
| Moviz   Import Sign out|    | Moviz                          Import Sign out |
| <- Back to picks       |    | <- Back to picks                               |
| +--------------------+ |    | +--------------+  Heat                         |
| |                    | |    | |              |  (headline, wraps)            |
| |      poster        | |    | |    poster    |  1995, 2h 50m, Crime, Drama   |
| |  (420 wide at most)| |    | |              |  A Los Angeles crime saga.    |
| | Because you loved  | |    | |              |  Synopsis, lines stop at 62   |
| | Collateral (2004)  | |    | | Because you  |  characters.                  |
| +--------------------+ |    | | loved        |  Directed by Michael Mann     |
| Heat                   |    | | Collateral   |  Cast                         |
| 1995, 2h 50m, Crime    |    | +--------------+  ---------------------------  |
| A Los Angeles crime... |    |                   Al Pacino as Vincent Hanna   |
| Synopsis...            |    |                   ---------------------------  |
| Directed by Michael... |    |                   Robert De Niro as Neil ...   |
| Cast                   |    +------------------------------------------------+
| ---------------------- |
| Al Pacino as Vincent.. |    Two columns from 1024px. The page order is the
+------------------------+    same at both sizes. No reason, no bar.
```

## Rules for new screens

1. Use the tokens and the components here. If something is missing, add it here first, then use it.
2. No hex values and no font names in components. No new shadows.
3. Motion goes in `globals.css`, with a duration token. Components name a class.
4. Every swipe outcome has a labelled button and a key. Every action has a visible focus ring and a target of at least 44px.
5. Show a movie in a list or deck only after the listable rule from the catalog (spec 0003). Components do not check it again.
6. Add the new component to the `/design` page in every state.
7. Keep reasons and ratings out of analytics and logs.

## Testing

- `pnpm test` runs the unit and render tests: the contrast guard, the token and doc checks, the motion budget, the components and the swipe logic.
- `pnpm test:e2e` runs the browser tests against a dev server: the axe scan of `/` and `/design`, layout shift, widths from 320 to 1280, keyboard and pointer swipes, and reduced motion.
- `pnpm test:e2e:production` builds the app, starts it with `VERCEL_ENV=production`, and checks that `/design` returns a 404.
- CI does not run Playwright yet, so the browser tests are enforced locally.

## Known gaps

- `SiteHeader` is rendered by route group layouts, which places it inside the root `main`. It works, but the header is not a top level landmark, and the skip link skips nothing before it. Fixing it means a small change to where `main` is rendered.
- The landing page links to `/sign-up` and `/sign-in`, which arrive with the sign in feature. Until then they lead to a 404.
- The hero looks for Collateral (2004), then Blade Runner 2049 (2017). It shows the first one the catalog holds with a poster.

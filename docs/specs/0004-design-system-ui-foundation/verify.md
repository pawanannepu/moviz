# Verify: design system and UI foundation · spec 0004 · updated 2026-11-09
_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Open `/` at 360px wide. You see the Moviz wordmark at hero size, the headline "Picks that say why.", the short line, the "Start swiping" and "Sign in" buttons, and the top of a poster with a yellow reason on it → AC-15
- [ ] Open `/` at 1280px wide. The text column is on the left and the poster on the right. A screen reader (or the page source) reads the hidden text "Example pick:" just before the reason → AC-15, AC-16
- [ ] Open `/` with the catalog database unreachable (stop the database or point `DATABASE_URL` at a closed port, then reload). The page still renders, with an empty poster frame that carries "Because you rated Heat highly." → AC-15
- [ ] Hero source: the poster on `/` is the first of Collateral (2004) or Blade Runner 2049 (2017) that your catalog holds with a poster. Change `HERO_PICKS` order and confirm the poster, its title and year, and its reason all change together → AC-15
- [ ] Press Tab once on `/`. "Skip to content" appears first. Press Enter and focus lands on the page content. Tab again and you reach "Start swiping", then "Sign in", each with a 3px light ring → AC-5
- [ ] Open `/design` while running locally. Every token and component shows: colors, type, buttons in each variant and state, fields with hint and error, movie cards, feed items, skeletons, the swipe card, the three states and toasts → AC-6, AC-17
- [ ] On `/design`, press "Show a toast" and "Show an error toast". Each appears bottom center, dark, with a visible close button → AC-6
- [ ] On `/design`, the feed item with a 200 character reason shows the whole reason in the yellow bar and nothing is cut off → AC-9
- [ ] On `/design`, the movie card for a movie with no poster and the one with a broken poster both show a dark frame with the title at the top (not covered by a reason bar) → AC-8
- [ ] Meta line source: a card for a movie with a year and three genres shows the year and the first two genres only. A movie with no year and no genres shows no meta line → AC-8
- [ ] Poster size source: inspect a card's image address. A plain card uses `/w342/`. A feed item, the swipe card and the hero use `/w500/`. The alt text reads "Poster for {title}" → AC-8
- [ ] On `/design`, the swipe card has three labelled buttons (Dislike, Not seen, Like) with icons. Press each with the mouse. Each decides once, and a second press while it is leaving does nothing → AC-10
- [ ] Drag the swipe poster right with a mouse, then left, then up. Each commits as Like, Dislike and Not seen. While dragging, the poster tilts and a bar shows the word. Release early and the card returns. Drag down and nothing is decided → AC-11
- [ ] On a touch screen or with touch emulation, drag the poster with a finger. The page does not scroll while you drag the poster, but scrolls normally when you drag on the buttons or text → AC-11, AC-16
- [ ] Focus the swipe card (Tab to it) and press ArrowRight, ArrowLeft and ArrowUp. Each decides like its button, ArrowUp does not scroll the page, and focus lands on the new card. Then press a button with the keyboard: focus lands on the same button of the new card → AC-12
- [ ] With a screen reader on, decide a card. It announces "Liked {title}", "Disliked {title}" or "Marked {title} as not seen", and the card is described as "{title}, {year}" with the hint "Use arrow keys or the buttons" → AC-12
- [ ] Turn on "Fail the next save" and decide. The card leaves, then returns, and works again → AC-12
- [ ] Turn on reduced motion in your system settings. The swipe exit, the return, the next card and the reason reveal do not animate, and every flow still works. Dragging still follows the pointer → AC-13
- [ ] Scroll `/design` down to the feed items with motion on. A bar below the fold wipes in once as it enters view. Reload with the bar already in view and it does not animate → AC-9, AC-13
- [ ] Press "Try again" on the error state and "Start swiping" on the empty state. The first shows a toast, the second links to `/` → AC-14
- [ ] Open `/design` and check the header: "Design" is the current page (`aria-current="page"`), "Home" is not → AC-7
- [ ] Open `/` and check the header: there is none, and the TMDB footer appears exactly once → AC-7
- [ ] Layout source: Resize to 320, 360, 768 and 1280px wide on `/` and `/design`. There is no sideways scrolling at any width, and the feed items go from one column to more as space allows → AC-16
- [ ] Zoom the browser to 400 percent on `/`. The content reflows with no sideways scrolling → AC-16
- [ ] Browser color source: view the page on a phone. The browser bar color matches the deep wine page background → AC-1
- [ ] Open `/design` on the production site (or a build run with `VERCEL_ENV=production`). It shows a 404. On a preview deployment it shows the page → AC-17

## Commands
- [ ] `pnpm check` → no errors → AC-1
- [ ] `pnpm typecheck` → no errors → AC-1
- [ ] `pnpm test` → all tests pass, including the contrast guard, the token test, the design doc test and the motion budget test → AC-1, AC-2, AC-3, AC-19
- [ ] `pnpm test:e2e` → all browser tests pass (needs the dev server and a seeded catalog for the real poster) → AC-4, AC-5, AC-9 to AC-13, AC-15, AC-16, AC-18
- [ ] `pnpm test:e2e:production` → `/design` returns 404 and `/` returns 200 on a production build → AC-17
- [ ] `DATABASE_URL=postgres://u:p@127.0.0.1:1/db pnpm build` → the build passes and `/` is prerendered with a one hour refresh → AC-15
- [ ] Edit `--color-dust` in `src/app/globals.css` to a much darker value, run `pnpm test src/ui/contrast.test.ts` → the test fails, then undo the edit → AC-3
- [ ] Add `transition-all` to a class in any file under `src/ui` (not a test), run `pnpm test src/ui/motion-budget.test.ts` → the test fails, then undo the edit → AC-19
- [ ] Read `design.md` at the repo root → it covers colors, type, spacing, motion, focus, dark only, every component and the three wireframes → AC-2

## Acceptance-criteria coverage
- AC-1 … covered by the `pnpm check`, `pnpm typecheck` and `pnpm test` steps, and the browser color step · AC-2 … the design.md step and `pnpm test` · AC-3 … the contrast step and `pnpm test` · AC-4 … `pnpm test:e2e` (layout shift and fonts) · AC-5 … the Tab and skip link step · AC-6 … the `/design` and toast steps · AC-7 … the header and footer steps · AC-8 … the poster, fallback and meta steps · AC-9 … the long reason and reveal steps · AC-10 … the button step · AC-11 … the drag and touch steps · AC-12 … the keyboard, screen reader and failed save steps · AC-13 … the reduced motion step · AC-14 … the states step · AC-15 … the landing steps and the unreachable database step · AC-16 … the resize and zoom steps · AC-17 … the `/design` production steps · AC-18 … `pnpm test:e2e` (axe scan) · AC-19 … the motion budget step

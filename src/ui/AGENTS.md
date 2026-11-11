# UI foundation

## Overview

The look and the shared building blocks every screen uses: the primitives, the movie and feed cards, the swipe card, the page states and the landing hero. The look itself is written in [design.md](../../design.md) (dark only, one palette, two fonts, three motion moments). Token values live in `src/app/globals.css`. Governing spec: [docs/specs/0004-design-system-ui-foundation/index.md](../../docs/specs/0004-design-system-ui-foundation/index.md).

## Key files

| File                                                                                                                                       | Owns                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `primitives/` (`button`, `input`, `label`, `skeleton`, `sonner`)                                                                           | shadcn components, restyled to the tokens. Add new ones with the shadcn CLI, then restyle                                             |
| `cn.ts`, `contrast.ts`                                                                                                                     | The class merge helper, and the contrast math the color tests use                                                                     |
| `field.tsx`, `skip-link.tsx`, `site-header.tsx`, `nav-links.tsx`                                                                           | Labelled field with hint and error, the skip link, and the header with `aria-current`                                                 |
| `poster-image.tsx`, `subtitle-bar.tsx`, `movie-card.tsx`, `feed-item.tsx`, `reason-reveal.tsx`, `movie-card-skeleton.tsx`, `movie-meta.ts` | Poster with its fallbacks, the yellow reason bar, the cards, the one time reveal, and the meta line                                   |
| `swipe-card/`                                                                                                                              | `SwipeCard` (buttons, pointer drag, arrow keys), `SwipeDeck` (live region, focus, next card), `decideFromDrag` (pure), `constants.ts` |
| `states/`                                                                                                                                  | `EmptyState`, `ErrorState` (client, `role="alert"`), `LoadingState`                                                                   |
| `load-more-bar.tsx`                                                                                                                        | The bar under a feed grid: one button for ready, working and failed (`aria-disabled`, focus stays put), a Sign in link for a lost session, and the done line. `design/load-more-demo.tsx` shows every state |
| `landing/`                                                                                                                                 | `Hero`, the fixed `HERO_PICKS`, and `loadHeroPick` (catalog lookup, returns null on failure)                                          |
| `design/`                                                                                                                                  | Demos for `/design` and `isDesignPageHidden` (404 when `VERCEL_ENV` is `production`)                                                  |

## Commands

```bash
pnpm test src/ui          # unit and component tests, including contrast, tokens, motion budget and design.md
pnpm test:e2e             # landing, /design and swipe flows in a browser, plus axe scans
pnpm test:e2e:production  # builds and checks /design is a 404 in production
```

## Conventions

- Build to `design.md`. Dark only. Yellow marks a reason or the next step, red marks errors only. Use the token classes, never a raw hex value, and the `type-*` utilities for text.
- Motion lives in `globals.css` only. Components name a class (`state-change`, `swipe-poster`, `glow-drag`, `feed-grid`) and never write their own animation. A test fails on any `@keyframes`, `animate-`, `transition` or `duration` in a `.ts`, `.tsx` or `.css` file here (tests and `primitives/sonner.tsx` are exempt), so keep those words out of comments too. `EXIT_MS` in `swipe-card/constants.ts` must equal `--dur-card`, and a test checks it.
- Server Components by default. The client ones are the swipe card and deck, the reason reveal, nav links, the error state, the Load more bar and the `/design` demos.
- Every interactive element is at least 44px high, has the global focus ring, and has a keyboard path. The swipe card always keeps its three labelled buttons.
- Posters come from `posterUrl` in `src/catalog/images.ts`: `w342` for a plain card, `w500` for a feed item, the swipe card and the hero. Alt text is "Poster for {title}". A missing or broken poster shows a dark frame with the title.
- Add every new component and state to the `/design` page.
- Component tests opt in to happy-dom per file. happy-dom reports an unloaded image as complete, so stub `complete` as false. Time a flick with `performance.now()`, not the event timestamp.
- The shadcn CLI once installed a wrong `cn` package and `next-themes`. Check `package.json` after any `shadcn add`. `components.json` points the aliases at `src/ui`.
- `SiteHeader` sits inside the root `main` today, which is not a top level landmark. It is listed under known gaps in `design.md`; fixing it changes AC-7 of the spec, so go through `/architect`.

_Drafted by /sync from the introducing change, worth a quick human pass._

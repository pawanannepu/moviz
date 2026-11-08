# 0004 Rationale: design system and UI foundation

## Context

Moviz is a movie recommendation app for people who care about film. Its one promise is that every pick says why it was chosen. The repo today is a bare scaffold: a white and black default page, the Geist font, a placeholder home screen, and a TMDB footer in neutral grey. There is no `design.md`, no shadcn setup and no shared component. Spec 0001 chose Tailwind and shadcn/ui and left the visual language to this spec.

Every slice 1 screen depends on this: sign in, the swipe deck, the feed. If each of them picked its own look, the product would feel stitched together, and accessibility would be rebuilt four times. The audience is film fans who would notice a Netflix copy, a Letterboxd copy or a generic SaaS template. The brief for this decision also rules out a purple SaaS look, a cream and terracotta look, a newspaper look and identical soft shadow card grids.

Hard constraints that shaped the choice: WCAG AA (contrast, visible focus, labels, keyboard), swipe must always have a button alternative, phone first with the same composition on larger screens, the Moviz name must be a hero level signal on the landing page, and motion is limited to two or three deliberate moments. Posters are hotlinked from TMDB (spec 0003), so the real art in the interface is theirs, and the interface has to let it lead.

If this stays undecided, the sign in feature would be the first to invent a look, and everything after would inherit it by accident.

## Options considered

### Option 1: Restyle shadcn/ui on a custom token layer ("the subtitle line") (chosen)

Keep shadcn/ui's accessible Radix based behavior, replace every visual decision with Moviz tokens, and build the movie and swipe components on top. The reason line is the signature: yellow subtitle text on the poster.

**Pros**:
- Reuses tested focus, keyboard and ARIA behavior from Radix instead of rebuilding it.
- Matches spec 0001 and the installed `shadcn` skill, so no new system to learn.
- We own the component code, so tokens and shapes can be exact.

**Cons**:
- shadcn defaults must be overridden everywhere, and an unrestyled component will look off. The `/design` page exists to catch that.
- Five new dependencies and a generated `components.json` to keep in step with the shadcn CLI.

### Option 2: Stock shadcn theme, tweak later

Run `shadcn init` with a neutral preset and adjust colors when there is time.

**Pros**:
- Fastest start, nothing to design.

**Cons**:
- Produces the generic look this product is trying to avoid, and "later" rarely arrives. Each feature then ships with the default look and a rework is needed.

### Option 3: A full component library with its own theme (for example Mantine)

Adopt a batteries included library and set its theme object.

**Pros**:
- Many components out of the box, including forms and overlays.

**Cons**:
- Replaces the stack choice in spec 0001, adds a large runtime and its own styling system next to Tailwind 4, and its default look is hard to move far from.

### Option 4: Build primitives on raw Radix with no shadcn

Use Radix packages directly and write every component.

**Pros**:
- No generated files, minimal surface.

**Cons**:
- Slower for slice 1, and the project has already adopted shadcn conventions and a skill for them. Gains nothing visible to the user.

### Visual direction options (the second decision inside this spec)

- **A. The subtitle line (chosen)**: dark wine auditorium, reasons set as subtitles. Rooted in how film shows words over images, and in the product promise.
- **B. Theater dark with warm projection light**: near black with an amber glow. Familiar and safe, but it is the "dark plus one warm accent" default and says nothing about reasons.
- **C. Print program restraint**: light paper, strong poster art, serif headlines. Distinctive for film culture, but sits close to the broadsheet and cream plus serif defaults, and a bright page makes posters look less vivid than a dark one does.

## Rationale

Option 1 is the only choice that gets both accessible behavior and a distinct look without leaving the stack already chosen. Option 2 defers the exact problem that forces this decision. Options 3 and 4 trade stack consistency for little user value. The repo has a tested path (shadcn plus Tailwind 4 theme variables), and one person can maintain it.

Direction A wins because it comes from the product, not from a style list. The core feeling is "personal taste, explained", and film already has a form for words over an image: the subtitle. Making the reason line the one memorable element means the design explains the product, and it keeps everything else quiet so posters carry the color. A dark room suits posters, and choosing dark only (instead of two themes) halves the contrast testing and removes theme switching from slice 1. The user asked for one primary mode, and nothing in slice 1 needs a second.

The first draft of the palette was a near black base with a single warm amber accent. That is the common generated default, so it was revised: the base became a visibly wine tinted dark, the accent became a subtitle yellow with a strict job (reasons and the next step only), the Geist scaffold font and any monospace data labels were dropped, shapes were varied by role (2px posters, 6px controls, no shadows), and the feed was made a grid of bare posters with no card chrome. Honest remaining risk: dark base plus one bright accent is still a familiar family. What separates it is the wine base, the subtitle role, and the type pairing, and the engineer should say if it still reads generic when built.

Archivo at a wide setting gives the wordmark the feel of a title card, which supports the hero level brand signal. Atkinson Hyperlegible Next was designed for reading clarity, which suits subtitle sized text and a WCAG target. Two families that differ this much do not compete.

The custom pointer events swipe (chosen by the engineer) fits the single card, three action need: about 150 lines, no dependency, and the keyboard and button paths stay in our hands. `motion` (about 30 KB) and `@use-gesture/react` were the runners up; either is a small change later if the gesture feel disappoints.

Decisions made here without a question, with the runner up:
- Dark only, no theme switch (runner up: system theme).
- `next/image` with `unoptimized` for TMDB posters, because TMDB already serves fixed sizes and optimizing 3,000 hotlinked images would use Vercel Hobby's image quota (runner up: add `remotePatterns` and optimize).
- Design system code in `src/ui/`, with shadcn output in `src/ui/primitives/` (runner up: default `components/ui`, which breaks the folder by feature rule).
- A `/design` page for review and the axe scan, hidden only when `VERCEL_ENV` is `production` so preview deployments can show it (runner up: gate on `NODE_ENV`, which is `production` on every Vercel preview; or Storybook, which adds a second build system for one person).
- The footer, skip link and `main` live in the root layout, and only `SiteHeader` varies by route group, so the footer is never rendered twice (runner up: an `AppShell` wrapper per layout).
- Swipe stays in this spec with custom drag, as the engineer chose; a cross check suggested buttons and keys only, with the gesture added in spec 7, as a way to cut risk.
- The feed as an auto fill grid of the same item (runner up: a single reel, which wastes wide screens).
- Landing has no header, so the wordmark is not shown twice (runner up: header plus hero wordmark).
- `design.md` is written last, from the built result, so it matches reality; the tokens in this spec are the source until then.
- Reason reveal uses a small client component with IntersectionObserver (runner up: CSS scroll driven animation, not yet in Safari).
- Arrow keys act only when the card itself has focus, so they never fight the buttons or a screen reader's own keys.

# Scope: Moviz

A movie recommendation web app for film fans. You sign in with email, bring your taste in by importing a Letterboxd CSV or by swiping through movies, and get a personalized feed where every pick says why it was chosen. A mood and vibe search finds a few picks from a short phrase.

**Build approach:** Tracer Bullet (vertical slices; each one works end to end through every layer, then later slices thicken one strand at a time).
**Workflow:** Beta (after `/develop`, run `/check verify`, then `/test`). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (for example `· GA`) to do more or less. Sign in and Privacy and legal carry `· GA` because they hold personal data.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

**Decisions behind this plan:** public product for film fans, responsive web first (works well on phones), solo builder with no deadline, free with no billing, email only sign in, English only. Accessibility target is WCAG AA, and swipe always has a button alternative. SEO is not planned because movie pages are not a search traffic goal right now.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | done |
| 2 | Coding standards & tooling | Foundation | done |
| 3 | Data model | Foundation | done |
| 4 | Movie catalog | Foundation | done |
| 5 | Design system & UI foundation | Foundation | done |
| 6 | Email sign in | Slice 1 | done |
| 7 | Swipe onboarding | Slice 1 | done |
| 8 | Taste profile & recommender | Slice 1 | done |
| 9 | Personalized feed with reasons | Slice 1 | done |
| 10 | Product analytics & error monitoring | Slice 2 | dropped |
| 11 | Letterboxd CSV import | Slice 3 | done |
| 12 | Movie detail page | Slice 4 | in-progress |
| 13 | Watchlist & seen list | Slice 5 | done |
| 14 | Feed feedback | Slice 6 | done |
| 15 | Bite search (mood and vibe) | Slice 7 | done |
| 16 | Where to watch | Slice 8 | in-progress |
| 17 | Privacy & legal basics | Slice 9 | done |
| 18 | Accessibility pass | Slice 9 | done |

## Foundations

### 1. Stack & architecture
Decide the stack and scaffold a runnable project so every later slice builds on real structure.
**Done when:** the stack is recorded in a spec and the empty scaffold boots locally and passes a build.
spec [0001](../specs/0001-stack-architecture/index.md) · code in `/` (project root, `src/app/`)
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`

### 2. Coding standards & tooling
Capture conventions, then install lint, format, and pre commit checks from the real scaffolded project.
**Done when:** root `AGENTS.md` reflects the real stack, and lint, format, and pre commit hooks run clean.
code in `biome.json`, `.husky/`, `.github/workflows/ci.yml`
- [x] Capture conventions and tooling choices: `/audit`
- [x] Install the tooling: `/develop tooling`
- [x] Check it runs clean: `/test`

### 3. Data model
The core records every slice builds on: users, movies, ratings, taste signals, watchlist and seen entries, feed feedback, and import records.
**Done when:** entities and relationships support all planned slices (import, watchlist, feedback, search) without a breaking migration, and a user's data can be exported and deleted.
spec [0002](../specs/0002-data-model/index.md) · code in `src/db/`, `src/ratings/`, `src/profile/`, `src/user-data/`, `drizzle/`
- [x] Design it (spec): `/architect data model`
- [x] Build it: `/develop data model`
  - [x] Database foundation and auth schema (AC-13, AC-15)
  - [x] Migration 1: schema, indexes, checks, and helpers (AC-1, AC-2, AC-7, AC-8, AC-9, AC-15)
  - [x] Slice 1 functions: ratings, swipes, profile, exclusions, cursors (AC-2, AC-4, AC-5, AC-14, AC-16, AC-17)
  - [x] Export and delete with the completeness test (AC-12, AC-13, AC-14)
- [x] Verify it: `/check verify data model`
- [x] Test it: `/test data model`

### 4. Movie catalog
Where movie facts come from (titles, year, genres, cast, posters, synopsis) and how they are stored, refreshed, and matched, because swipe, feed, import, and search all depend on it.
**Done when:** a few thousand real movies with posters and metadata are queryable, and a title plus year can be matched to one catalog movie reliably.
spec [0003](../specs/0003-movie-catalog/index.md) · code in `src/catalog/`, `drizzle/`
- [x] Design it (spec): `/architect movie catalog`
- [x] Build it: `/develop movie catalog`
  - [x] Foundation and one movie end to end: env names, migration, TMDB client, write path, read functions (AC-3, AC-6, AC-7, AC-13, AC-15, AC-16, AC-17, AC-18, AC-19)
  - [x] Full seed script: `pnpm catalog:seed` for 3,000 movies (AC-1, AC-2)
  - [x] Title plus year matcher (AC-4, AC-5)
  - [x] Embeddings script (AC-8, AC-9)
  - [x] Daily cron and TMDB footer notice (AC-10, AC-11, AC-12, AC-14)
- [x] Verify it: `/check verify movie catalog`
- [x] Test it: `/test movie catalog`

### 5. Design system & UI foundation
Visual language, layout, and base components, including the swipe card and movie card, so every screen feels cohesive and works on phones.
**Done when:** `design.md` covers type, color, spacing, and components, and base components handle focus and keyboard. The swipe card has a button alternative.
spec [0004](../specs/0004-design-system-ui-foundation/index.md)
code in [src/ui/](../../src/ui/)
- [x] Design it (spec): `/architect design system & UI foundation`
- [x] Build it: `/develop design system & UI foundation`
  - [x] Thread: tokens, fonts, layout pieces, and the real landing page (AC-1, AC-4, AC-5, AC-7, AC-15)
  - [x] Contrast guard, primitives, states, and the `/design` page (AC-3, AC-6, AC-14, AC-17)
  - [x] Movie card and feed item with the reason bar (AC-8, AC-9, AC-13, AC-19)
  - [x] Swipe card: buttons, drag, keyboard (AC-10, AC-11, AC-12, AC-13, AC-19)
  - [x] Browser tests, gates, and `design.md` (AC-2, AC-16, AC-17, AC-18)
- [x] Verify it: `/check verify design system & UI foundation`
- [x] Test it: `/test design system & UI foundation`

## Slice 1: Core loop (the first working thread)

Sign in, swipe a few movies, see a feed with reasons. Real auth, real data, real UI, just narrow. This slice is also the walking skeleton.

### 6. Email sign in · GA
Create an account and sign in with email, stay signed in, and reset a forgotten password.
**Done when:** a new user can sign up, sign in, sign out, and reset access by email; signed out users cannot reach personal pages; errors and empty states are clear.
spec [0005](../specs/0005-email-sign-in/index.md) · code in `src/auth/`, `src/email/`, `src/app/(auth)/`, `src/app/(protected)/`, `src/app/api/auth/`
- [x] Design it (spec): `/architect email sign in`
- [x] Build it: `/develop email sign in`
  - [x] Thread: sign up, verify email, land signed in on `/home`, sign out (AC-1, AC-2, AC-5, AC-12, AC-14, AC-15, AC-16)
  - [x] Sign in and protect every page: return path, route guard, session renewal, signed in redirects (AC-3, AC-4, AC-8, AC-9)
  - [x] Password reset and the no leak rules (AC-6, AC-7)
  - [x] GA hardening: Turnstile, rate limits, real Resend email, delete user hook, form polish (AC-10, AC-11, AC-13, AC-14, AC-15)
- [x] Verify it: `/check verify email sign in`
- [x] Test it: `/test email sign in`
- [x] Review it (fresh model): `/check review email sign in`
- [x] Document it: `/document email sign in`

### 7. Swipe onboarding
A swipe deck of well known movies where you say liked, disliked, or not seen, so a new user with no history gets a taste profile fast.
**Done when:** a new user swipes through a deck (gesture or buttons), their choices are saved as ratings, they can stop at any point once enough signal exists, and they land on the feed.
spec [0006](../specs/0006-swipe-onboarding/index.md) · code in `src/onboarding/`, `src/app/(protected)/onboarding/`
- [x] Design it (spec): `/architect swipe onboarding`
- [x] Build it: `/develop swipe onboarding`
  - [x] Thread: gate, deck, save, finish (AC-1, AC-3, AC-6, AC-7, AC-11)
  - [x] Genre rotation order (AC-2)
  - [x] Counter, announcements and end states (AC-4, AC-8, AC-9)
  - [x] Undo: toast and button (AC-5, AC-8)
  - [x] Failure handling and concurrency (AC-7, AC-10)
  - [x] Browser and accessibility pass (AC-11, AC-12)
- [x] Verify it: `/check verify swipe onboarding`
- [x] Test it: `/test swipe onboarding`

### 8. Taste profile & recommender
Turn a user's ratings into a taste profile and rank movies for them, keeping the signals needed to explain each pick. Starts thin and gets thicker as later slices add input.
**Done when:** given a user's ratings, it returns a ranked list that excludes movies they have rated, and each result carries the reasons it was ranked.
spec [0007](../specs/0007-taste-profile-recommender/index.md) · code in `src/recommend/`
- [x] Design it (spec): `/architect taste profile & recommender`
- [x] Build it: `/develop taste profile & recommender`
  - [x] Thread: anchors, scoring query and ranked picks with reasons (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-13, AC-14, AC-19)
  - [x] Strength, taste summary and the popular fallback (AC-7, AC-8, AC-9, AC-18)
  - [x] Popularity nudge and variety cap (AC-10, AC-11)
  - [x] Paging and input checks (AC-12, AC-15)
  - [x] Failure handling, privacy and cost check (AC-15, AC-16, AC-17, AC-19)
- [x] Verify it: `/check verify taste profile & recommender`
- [x] Test it: `/test taste profile & recommender`

### 9. Personalized feed with reasons
The home screen: a scrollable feed of recommended movies, each with a short human readable reason such as "because you rated Heat highly".
**Done when:** a user who finished onboarding sees a feed of movies they have not rated, every card shows a reason, and loading, empty, and error states render.
spec [0008](../specs/0008-personalized-feed/index.md) · code in `src/feed/`, `src/ui/load-more-bar.tsx`, `src/app/(protected)/home/`
- [x] Design it (spec): `/architect personalized feed with reasons`
- [x] Build it: `/develop personalized feed with reasons`
  - [x] Thread: guarded page, header, loading state and the first batch with reason sentences (AC-1, AC-2, AC-3, AC-5, AC-13, AC-16)
  - [x] Early picks line, empty state and first load error (AC-4, AC-6, AC-7)
  - [x] Load more: action, client list, announcements and the done line (AC-8, AC-9, AC-11, AC-12)
  - [x] Load more failures: error, rejected call and lost session (AC-10)
  - [x] Privacy, accessibility and the browser pass (AC-13, AC-14, AC-15, AC-16)
- [x] Verify it: `/check verify personalized feed with reasons`
- [x] Test it: `/test personalized feed with reasons`

## Slice 2: Know what is happening

### 10. Product analytics & error monitoring · dropped
See signups, onboarding completion, import success, and crashes, so you can tell whether people reach the feed.
**Done when:** key events (signup, swipe completed, feed viewed) are recorded without personal ratings content, and unhandled errors reach one place you can read.
- [ ] Design it (spec): `/architect product analytics & error monitoring`

## Slice 3: Letterboxd import

### 11. Letterboxd CSV import
Upload a Letterboxd ratings CSV, match each row to the catalog, and fold the ratings into the taste profile.
**Done when:** a user can upload a Letterboxd export, sees how many rows matched and which did not, the matched ratings change their feed, and a bad or empty file gives a clear error.
spec [0009](../specs/0009-letterboxd-csv-import/index.md) · code in `src/import/`, `src/app/api/import/`, `src/app/(protected)/import/`, `src/ui/count-tile.tsx`, `src/ui/file-field.tsx`
- [x] Design it (spec): `/architect letterboxd csv import`
- [x] Build it: `/develop letterboxd csv import`
  - [x] Thread: migration, parser, row rules, match, save and a bare `/import` page (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6)
  - [x] Safety: origin check, daily cap, failed record, per user lock and time budget (AC-7, AC-9, AC-12, AC-17)
  - [x] Onboarding rule, keep 5 pruning, export and delete (AC-8, AC-10, AC-13)
  - [x] Not matched list with Load more, and the entry links (AC-11, AC-15)
  - [x] Full page states, accessibility and the 20,000 row limits check (AC-14, AC-16)
- [x] Verify it: `/check verify letterboxd csv import`
- [x] Test it: `/test letterboxd csv import`

## Slice 4: Movie detail

### 12. Movie detail page · in-progress
A page per movie with poster, synopsis, cast, year, genres, and why it was recommended when you arrive from the feed.
**Done when:** tapping a feed card opens the detail page, it works on phone and desktop, and an unknown movie shows a not found state.
spec [0010](../specs/0010-movie-detail-page/index.md) · code in `src/movie/`, `src/app/(protected)/movie/`, `src/recommend/reason-for.ts`, `src/feed/feed-store.tsx`
- [x] Design it (spec): `/architect movie detail page`
- [x] Build it: `/develop movie detail page`
  - [x] Thread: feed cards link to `/movie/[id]`, the id check, a bare page and the not found state (AC-1, AC-2, AC-3, AC-12)
  - [x] The reason: `reasonFor`, the bar on the poster and its failure fallback (AC-7, AC-8, AC-9, AC-16, AC-17)
  - [x] All the facts, the two layouts, the page title, and the loading and error states (AC-4, AC-5, AC-6, AC-10, AC-11, AC-19)
  - [x] The feed keeps its place: the store, restore and focus, and "Back to picks" (AC-13, AC-14, AC-15)
  - [x] Accessibility, `design.md`, the `/design` page and the browser pass (AC-18, AC-20)
- [ ] Verify it: `/check verify movie detail page`
- [x] Test it: `/test movie detail page`

## Slice 5: Watchlist and seen

### 13. Watchlist & seen list · done
Save movies for later, mark ones you have watched, and rate them. Ratings feed back into the taste profile.
**Done when:** a user can add or remove a movie from the watchlist, mark it seen with a rating, see both lists, and the feed stops showing movies they have seen.
spec [0002](../specs/0002-data-model/index.md) · code in `src/watchlist/`, `src/ratings/`, `src/app/(protected)/lists/`, `src/movie/`
- [x] Build it: `/develop watchlist & seen list`
  - [x] Migration 3 and the watchlist / seen data functions
  - [x] Add, remove, rate, and list page actions
  - [x] Apply migration 3 and confirm the live schema

## Slice 6: Feed feedback

### 14. Feed feedback · done
Tell the feed "not interested" or "more like this" on any pick, so recommendations get better after the first visit.
**Done when:** a user can dismiss a pick or ask for more like it, dismissed movies stay gone, and the next feed visibly reflects the feedback.
spec [0011](../specs/0011-feed-feedback/index.md) · code in `src/feedback/`, `src/user-data/exclusions.ts`, `src/recommend/load-taste.ts`, `src/feed/feed-list.tsx`, `src/movie/load-movie-page.ts`, `drizzle/0004_feed_feedback.sql`
- [x] Design it (spec): `/architect feed feedback`
- [x] Build it: `/develop feed feedback`
  - [x] Migration 4, feedback data functions, the exclusion clause, export and delete (AC-4, AC-13, AC-14)
  - [x] Thread: "Not interested", the Hidden line and Undo on feed cards (AC-1, AC-2, AC-3, AC-12, AC-13)
  - [x] "More like this" toggle and the recommender's feedback anchors and reason (AC-1, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10)
  - [x] Movie page controls and the kept feed (AC-11, AC-15)
  - [x] Browser and accessibility pass (AC-1 to AC-15)
- [x] Verify it: `/check verify feed feedback`
- [x] Test it: `/test feed feedback`

## Slice 7: Bite search

### 15. Bite search (mood and vibe) · done
Type a short phrase like "something short and funny tonight" and get a few matching picks, shaped by the user's taste, each with a reason.
**Done when:** a short phrase returns a small set of relevant movies the user has not rated, each with a reason; empty, slow, and failed searches are handled.
spec [0012](../specs/0012-bite-search/index.md) · code in `src/search/`, `src/app/(protected)/search/`, `src/user-data/purge-old-rows.ts`
- [x] Design it (spec): `/architect bite search`
- [x] Build it: `/develop bite search`
  - [x] Migration 5, the quota, export and delete (AC-3, AC-15)
  - [x] Thread: Voyage query embedding, scoring, the action and the `/search` page with cards (AC-1, AC-2, AC-6, AC-11, AC-14)
  - [x] Word rules, the "Looking for" line, the taste blend and reasons (AC-4, AC-5, AC-7, AC-8)
  - [x] Failure strand: words mode, time budget, quota, empty and error states, kept results (AC-3, AC-9, AC-10, AC-12, AC-13)
  - [x] Purge in the daily cron, privacy and browser pass (AC-15, AC-16)
- [x] Verify it: `/check verify bite search`
- [x] Test it: `/test bite search`

## Slice 8: Where to watch

### 16. Where to watch · in-progress
Show which streaming services carry a movie in the user's country, on the movie detail page (feed cards are deferred).
**Done when:** a movie shows the services that carry it for the user's country, or a clear "not found on streaming" state, and the data source is credited as required.
spec [0013](../specs/0013-where-to-watch/index.md) · code in `src/watch/`
- [x] Design it (spec): `/architect where to watch`
- [x] Build it: `/develop where to watch`
  - [x] Migration 6 and the TMDB watch providers call (AC-7, AC-11)
  - [x] Thread: the cached read and the section on the movie page with the credit (AC-1, AC-2, AC-3, AC-4, AC-7)
  - [x] Country: IP default, the picker and its action (AC-5, AC-6, AC-10)
  - [x] Failure strand, accessibility and the browser pass (AC-8, AC-9, AC-12)
- [ ] Verify it: `/check verify where to watch`
- [x] Test it: `/test where to watch`

## Slice 9: Launch readiness

### 17. Privacy & legal basics · done · GA
Privacy policy, terms, and the controls for personal data: export my data and delete my account.
**Done when:** policy and terms pages are linked from sign up, a user can download their data and delete their account with all their ratings removed, and a signup consent line is present.
spec [0014](../specs/0014-privacy-legal-basics/index.md) · code in `src/legal/`, `src/account/`
- [x] Design it (spec): `/architect privacy & legal basics`
- [x] Build it: `/develop privacy & legal basics`
  - [x] Thread: policy and terms pages, footer links, sign up consent line, terms version (AC-1, AC-2, AC-3, AC-4, AC-5)
  - [x] Launch check on the legal details (AC-12)
  - [x] Account page, country and the data export (AC-6, AC-7, AC-8, AC-14)
  - [x] Delete account with its rate limit, and retention (AC-9, AC-10, AC-11, AC-13)
  - [x] Browser and accessibility pass (AC-1 to AC-14)
- [x] Verify it: `/check verify privacy & legal basics`
- [x] Test it: `/test privacy & legal basics`
- [x] Review it (fresh model): `/check review privacy & legal basics`
- [x] Document it: `/document privacy & legal basics`

### 18. Accessibility pass · done
A final sweep that every screen meets WCAG AA: keyboard, screen reader labels, contrast, and focus, including swipe via buttons.
**Done when:** every screen can be used with keyboard only, passes an automated accessibility scan, and swipe actions have labelled button equivalents.
code in `e2e/auth/accessibility.spec.ts`, `src/app/not-found.tsx`, `src/watchlist/`, `src/app/(protected)/lists/`
- [x] Build it: `/develop accessibility pass`

## Deferred
Out of scope for this build pass, kept so the plan stays honest.
- **Social sign in**: Google and other providers · needs a decision
- **Friends and sharing**: share lists, see what friends rated · needs a decision
- **Paid plans**: free and paid tiers · needs a decision · GA
- **Native mobile app**: swipe as a native app · needs a decision
- **Other languages**: translated interface · needs a decision
- **Letterboxd import extras**: download unmatched rows as a CSV, undo an import, accept the full export zip, import watched and watchlist files, a progress bar for large files · needs a decision · from spec 0009
- **Where to watch on feed cards**: small service logos on each card, needing availability synced ahead of time · needs a decision · from spec 0013
- **Bite search with an LLM**: an LLM step that reads odd phrasing into filters, replacing the word rules · needs a decision · from spec 0012
- **Movie detail extras**: a per user limit on the page (with launch hardening), a pending hint on card taps, Cache Components in place of the feed store · needs a decision · from spec 0010

## Legend

**The decision box.** Every feature that needs a decision carries exactly one, the box whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills find it by the `(spec)` suffix. Every other box is an execution box, and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves.

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | `/architect` at spec capture | `Design it` ticked; spec linked; `Build it: /develop <feature>` plus 2 to 5 milestones; the closing boxes for the tier |
| `in-progress` (building) | `/develop` | milestone boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` and milestones ticked; `Verify it` ticked |
| `done` | you, when you decide it is; `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped |

- **Next step** is the first unticked box (always a command or a tracked milestone).
- **needs a decision** means run `/architect` first; otherwise go straight to `/develop` (or `/audit` for standards and tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here.** The scope carries only the milestone rollup.
- **Status** goes `planned`, `in-progress`, `done`, plus `existing` (built before the workflow) and `dropped` (de scoped, kept for history).
- **Approach tag** beside a heading (for example `· Facade`) overrides the project default for that feature; no tag inherits it.
- **Workflow tier tag** beside a heading (for example `· GA`) sets that one feature's rigor above or below the project default; no tag inherits it.
- **Workflow** (header line) is the project default for what runs after `/develop`: Prototype is nothing, Alpha is `/check verify`, Beta is `/check verify` then `/test`, GA adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`) appears once those exist: the spec link from `/architect`, the code path from `/develop`.

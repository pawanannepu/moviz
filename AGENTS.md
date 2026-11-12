# Moviz

A movie recommendation web app for film fans. Every pick in the feed says why it was chosen.

## Stack

Source of truth: [docs/specs/0001-stack-architecture/index.md](docs/specs/0001-stack-architecture/index.md). Change it there first.

- **Language / Runtime**: TypeScript (strict), Node.js 22 or newer
- **Framework**: Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui
- **Data**: Postgres on Neon with pgvector, Drizzle ORM over a `pg` Pool, Zod at every boundary
- **Services**: Better Auth (email sign in), Resend (email), Voyage AI (embeddings), Vercel (hosting and cron)
- **Package manager**: pnpm 10 (pinned in `packageManager`)
- Built so far: the Next.js scaffold, the data layer (`src/db`, `src/auth`, `src/profile`, `src/ratings`, `src/user-data`) and the movie catalog (`src/catalog`, with a daily cron at `/api/cron/catalog`). The design system and UI foundation (`src/ui`, `design.md`, the landing page at `/` and the review page at `/design`). Email sign in (`src/auth`, `src/email`, the pages in `src/app/(auth)` and `src/app/(protected)`, and the route guard in `src/proxy.ts`). Swipe onboarding (`src/onboarding`, the page at `/onboarding`, and the gate on `/home`). The taste recommender (`src/recommend`, a server function the feed calls). The personalized feed (`src/feed`, the page at `/home`, with a Load more button). The product screens arrive with the feature that needs them. Later slices include Letterboxd CSV import (`src/import` and `/import`), movie details (`src/movie` and `/movie/[id]`), watchlist and seen lists (`src/watchlist` and `/lists`), feed feedback (`src/feedback`), Bite search (`src/search` and `/search`), streaming availability by country (`src/watch`), privacy and legal pages with account controls (`src/legal`, `src/account`, and `/account`), and the accessibility pass.

## Build approach

Tracer Bullet: vertical slices, each one works end to end through every layer, then later slices thicken one strand at a time. Plan: [docs/scope/scope.md](docs/scope/scope.md).

## Commands

```bash
pnpm install
pnpm dev         # http://localhost:3000
pnpm build
pnpm typecheck   # next typegen && tsc --noEmit
pnpm check       # Biome lint, format, and import order check (what CI runs)
pnpm check:fix   # same, but writes fixes
pnpm lint        # Biome lint only
pnpm format      # Biome format, writes changes
pnpm test        # Vitest unit and integration (src/**/*.test.ts); database tests need DATABASE_URL_TEST and skip without it
pnpm test:watch  # Vitest in watch mode
pnpm test:e2e    # Playwright end to end and axe accessibility scans (e2e/*.spec.ts)
pnpm test:e2e:production # builds, starts with VERCEL_ENV=production on port 3100, checks /design is a 404
pnpm exec playwright test -c playwright.auth.config.ts # email sign in specs (e2e/auth/), builds and starts on port 3101 with Turnstile test keys; skipped by pnpm test:e2e
pnpm db:generate # drizzle-kit: write a migration from the schema change
pnpm db:migrate  # apply migrations to the database in .env.local (check which branch first)
pnpm catalog:seed    # load the TMDB catalog, resumable (--target <n>, --id <tmdbId>); needs TMDB_API_TOKEN
pnpm embed:catalog   # write Voyage embeddings for listable movies; needs VOYAGE_API_KEY
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title/index.md`.

## Rules

- Architecture is functional: pure functions by default, immutable data, side effects (database, network, email) kept at the edges and made explicit. Prefer plain functions over classes. Expected failures return a typed result, not a thrown exception.
- Folder by feature: colocate each feature under `src/<feature>/` (for example `src/auth`, `src/email`, `src/db`). `src/app/` holds routes and thin pages only.
- Server Components by default. Add `"use client"` only for interactive pieces. Only server code touches the database or reads secrets.
- Every Server Action and Route Handler validates input with Zod and checks the signed in user before touching data. Ratings content never goes to analytics or logs.
- Validate env vars at startup: one server only `src/env.ts` parses `process.env` with Zod. Add each new name to `.env.example`.
- Use one error handling pattern for Server Actions and Route Handlers: return a typed result and map it to a clear user message at the edge.
- TypeScript stays `strict`: no `any`, exhaustive types. Document exported functions that other features call with a short doc comment.
- Accessibility baseline is WCAG AA: keyboard, visible focus, labels, contrast. Swipe always has a button alternative.
- Design system: build all UI to [design.md](design.md) (dark only, the Pit, Curtain, Screen, Dust, Subtitle, Exit and Edge palette, the three motion moments); token values live in `src/app/globals.css`, components in `src/ui/`.
- Every route is closed to signed out visitors by default (`src/proxy.ts`). Open a public page by adding it to `src/auth/public-paths.ts`. The guard only looks for the cookie, so protected pages, Server Actions and Route Handlers still read the live session.
- Schema changes go through Drizzle migrations only. All database code runs on the Node.js runtime.
- Commit messages follow Conventional Commits, for example `feat(auth): add password reset`.

## Tooling

Chosen here, installed by `/develop tooling`. Installed: Biome (`biome.json`), the Husky pre commit hook (`.husky/pre-commit`, runs lint-staged then typecheck), CI (`.github/workflows/ci.yml`, runs `pnpm test` but not Playwright yet), Vitest (`vitest.config.ts`), and Playwright (`playwright.config.ts`, Chromium only). Runner choices are saved in `test-preferences.json`. Vitest suites cover the data model, the catalog and `src/ui` (component tests opt in to happy-dom per file with `// @vitest-environment happy-dom`). Playwright specs cover the TMDB footer, the landing page and `/design`. Shared test helpers live in `src/test-support/`, including `axe.ts`, which runs axe-core in component tests.

- Lint and format: Biome (one tool, one config file).
- Before each commit: lint, format, and typecheck.
- Testing: Vitest for unit and integration, Playwright with `@axe-core/playwright` for end to end and accessibility. Tests are written after building (Beta workflow: `/develop`, then `/check verify`, then `/test`). `/test` sets up the runner.
- CI: GitHub Actions on every push and PR, running lint, typecheck, build, and test.

## Git

- integration: on
- branch prefix: feat/
- commit: per-milestone

Pushes and PRs always ask first.

## Agent skills

- [nextjs-app-router-patterns](.claude/skills/nextjs-app-router-patterns/): `wshobson/agents`, App Router, Server Components, data fetching
- [vercel-react-best-practices](.claude/skills/vercel-react-best-practices/): `vercel-labs/agent-skills`, React and Next.js performance
- [deploy-to-vercel](.claude/skills/deploy-to-vercel/): `vercel-labs/agent-skills`, deploys and preview links (one scanner rated it Medium risk, review before use)
- [typescript-advanced-types](.claude/skills/typescript-advanced-types/): `wshobson/agents`, generics and type utilities
- [tailwindcss](.claude/skills/tailwindcss/): `hairyf/skills`, Tailwind utilities and theme
- [shadcn](.claude/skills/shadcn/): `shadcn-ui/ui`, adding and composing shadcn components
- [drizzle-orm-patterns](.claude/skills/drizzle-orm-patterns/): `giuseppe-trisciuoglio/developer-kit`, schema, queries, migrations
- [neon-postgres](.claude/skills/neon-postgres/): `neondatabase/agent-skills`, Neon connections, branching, pgvector
- [pnpm](.claude/skills/pnpm/): `antfu/skills`, pnpm commands and config
- [better-auth-best-practices](.claude/skills/better-auth-best-practices/): `better-auth/skills`, Better Auth setup (move to `src/auth/AGENTS.md` when that area exists)
- [email-and-password-best-practices](.claude/skills/email-and-password-best-practices/): `better-auth/skills`, Better Auth email and password, verification and reset flows (move to `src/auth/AGENTS.md` when that area exists)
- [turnstile-spin](.claude/skills/turnstile-spin/): `cloudflare/skills`, Cloudflare Turnstile bot check setup (move to `src/auth/AGENTS.md` when that area exists)
- [vitest](.claude/skills/vitest/): `antfu/skills`, Vitest unit and integration tests
- [playwright-best-practices](.claude/skills/playwright-best-practices/): `currents-dev/playwright-best-practices-skill`, Playwright tests, including axe accessibility checks
- [playwright-cli](.claude/skills/playwright-cli/): `microsoft/playwright-cli`, driving a real browser from the command line

Declined: Vercel MCP, Next.js DevTools MCP, shadcn MCP
MCP servers: Neon (recommended, connect it yourself, use read only mode on production data), Playwright MCP (recommended, connect it yourself)

## Context files

- [src/catalog/AGENTS.md](src/catalog/AGENTS.md): TMDB sync, cron job, embeddings, title matching and the listable rule for the movie catalog
- [src/email/AGENTS.md](src/email/AGENTS.md): sending email through Resend or the local console, the auth email templates and the never throw rule
- [src/feed/AGENTS.md](src/feed/AGENTS.md): the personalized feed on `/home`, reason sentences, Load more, its focus and error rules
- [src/onboarding/AGENTS.md](src/onboarding/AGENTS.md): the swipe onboarding deck, its rules, Server Actions and the `/home` gate
- [src/recommend/AGENTS.md](src/recommend/AGENTS.md): the taste recommender, how a pick is scored, its reasons, and how its database tests share one branch
- [src/watchlist/AGENTS.md](src/watchlist/AGENTS.md): watchlist and seen list data, actions, and page behavior
- [src/ui/AGENTS.md](src/ui/AGENTS.md): design tokens, primitives, movie and feed cards, the swipe card, page states, the landing hero and the `/design` page

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

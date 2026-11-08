# Moviz

A movie recommendation web app for film fans. Every pick in the feed says why it was chosen.

## Stack

Source of truth: [docs/specs/0001-stack-architecture/index.md](docs/specs/0001-stack-architecture/index.md). Change it there first.

- **Language / Runtime**: TypeScript (strict), Node.js 22 or newer
- **Framework**: Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui
- **Data**: Postgres on Neon with pgvector, Drizzle ORM over a `pg` Pool, Zod at every boundary
- **Services**: Better Auth (email sign in), Resend (email), Voyage AI (embeddings), Vercel (hosting and cron)
- **Package manager**: pnpm 10 (pinned in `packageManager`)
- Only the Next.js scaffold exists today. The rest arrives with the feature that needs it.

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
pnpm test        # Vitest unit and integration (src/**/*.test.ts), exits 0 while no tests exist
pnpm test:watch  # Vitest in watch mode
pnpm test:e2e    # Playwright end to end and axe accessibility scans (e2e/*.spec.ts)
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
- Schema changes go through Drizzle migrations only. All database code runs on the Node.js runtime.
- Commit messages follow Conventional Commits, for example `feat(auth): add password reset`.

## Tooling

Chosen here, installed by `/develop tooling`. Installed: Biome (`biome.json`), the Husky pre commit hook (`.husky/pre-commit`, runs lint-staged then typecheck), CI (`.github/workflows/ci.yml`, runs `pnpm test` but not Playwright yet), Vitest (`vitest.config.ts`), and Playwright (`playwright.config.ts`, Chromium only). Runner choices are saved in `test-preferences.json`. No tests exist yet.

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
- [resend](.claude/skills/resend/): `resend/resend-skills`, Resend email API (move to `src/email/AGENTS.md` when that area exists)
- [vitest](.claude/skills/vitest/): `antfu/skills`, Vitest unit and integration tests
- [playwright-best-practices](.claude/skills/playwright-best-practices/): `currents-dev/playwright-best-practices-skill`, Playwright tests, including axe accessibility checks
- [playwright-cli](.claude/skills/playwright-cli/): `microsoft/playwright-cli`, driving a real browser from the command line

Declined: Vercel MCP, Next.js DevTools MCP, shadcn MCP
MCP servers: Neon (recommended, connect it yourself, use read only mode on production data), Playwright MCP (recommended, connect it yourself)

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 0001. Stack and architecture: a Next.js monolith on Postgres

**Date**: 2026-11-05
**Status**: Accepted

## Summary

Moviz will be one TypeScript web app built with Next.js, with Postgres (hosted on Neon) as its single database. Sign in lives inside the app with Better Auth, and the app runs on Vercel. Movie "mood" search will use embeddings (numbers that capture meaning) stored in the same Postgres database, so there is no second data system to run. This keeps the whole product runnable by one person, and each service has a free tier or free allowance (limits still to be verified). Later features build on this foundation, and a few choices (movie data source, analytics) are left to their own specs.

## Requirements

Constraints the stack must satisfy (from the scope; these are limits on the choice, not acceptance criteria):

- Responsive web that works well on phones. The UI base must support WCAG AA (keyboard, focus, labels).
- Free to run at launch scale. No mandatory paid plan.
- Operable by one person: one deployable app, managed services only, no container orchestration.
- Personal data lives in our own Postgres so a user's data can be exported and deleted (Sign in and Privacy are GA tier).
- Semantic (meaning based) search over movies must be possible without a separate search system.
- English only. SEO is not a goal, so no static generation work for search traffic.

## Decision

**Chosen option**: Option 1: Next.js monolith on Neon Postgres, hosted on Vercel.

One Next.js (App Router) app in TypeScript, one Postgres database with pgvector, accessed through Drizzle, with Better Auth for email sign in, deployed on Vercel, with GitHub Actions as the CI.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.claude/skills/nextjs-app-router-patterns/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `deploy-to-vercel` (`vercel-labs/agent-skills`, `.claude/skills/deploy-to-vercel/`) · `typescript-advanced-types` (`wshobson/agents`, `.claude/skills/typescript-advanced-types/`) · `tailwindcss` (`hairyf/skills`, `.claude/skills/tailwindcss/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.claude/skills/drizzle-orm-patterns/`) · `neon-postgres` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres/`) · `better-auth-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-best-practices/`) · `resend` (`resend/resend-skills`, `.claude/skills/resend/`) · `pnpm` (`antfu/skills`, `.claude/skills/pnpm/`)

## Proposed stack

Versions are what the registry showed on 2026-11-05. Pin exact versions at scaffold time.

| Layer | Choice | Reason |
|---|---|---|
| Architecture | Modular monolith, one deployable | One person, small scale; extract nothing until a measured bottleneck forces it. |
| Language | TypeScript (strict mode) | One language and one set of types for UI, server, and data access. |
| Runtime and package manager | Node.js current LTS, pnpm (pinned with the `packageManager` field) | Widest host and framework support; strict, fast installs. |
| Framework | Next.js 16.x, App Router (16.4.5 on npm at check time) | Server Components and Server Actions cover reads and writes with the least glue. |
| UI | React, Tailwind CSS, shadcn/ui (Radix based components copied into the repo) | Accessible focus and keyboard behavior out of the box, and we own the component code. Visual language is decided in spec 5. |
| Primary DB | Postgres on Neon, with the pgvector extension | Relational data fits the domain, and vectors live next to the movies they describe. |
| Data access | Drizzle ORM (0.45.x) over a `pg` Pool (`drizzle-orm/node-postgres`), SQL migrations via `drizzle-kit` | SQL shaped and typed; plain SQL for ranking and vector queries. |
| Auth | Better Auth (1.7.x) running in the app, users and sessions in our Postgres | Proven library, no vendor holds user data, email and password with reset. |
| Transactional email | Resend | Simple API for verify and reset emails; needs a sending domain with SPF and DKIM. |
| Embeddings | Voyage AI hosted embeddings API, small model (runner up: OpenAI, which needs prepaid credit and has no free tier) | Catalog is embedded once, search phrases on demand. Voyage was reported to have a free token allowance (unverified). Model name, dimension, and allowance must be re checked at build. |
| Search | Postgres full text plus pgvector similarity (HNSW index, cosine distance) | No separate search engine for a few thousand movies. |
| API shape | Server Components read; Server Actions mutate; Route Handlers for CSV upload, cron endpoints, and the auth handler | Least code in a single app; no extra RPC layer. |
| Validation | Zod at every boundary (Server Action input, Route Handler input, env vars) | One schema is both the runtime check and the TypeScript type. |
| Background work | Vercel Cron (daily only and production only on Hobby) calling Route Handlers that check `Authorization: Bearer ${CRON_SECRET}`; Letterboxd import runs inline in the request | Matching rows against a local catalog is fast; no queue to operate. |
| File storage | None for now. The CSV is parsed in memory and discarded. | Nothing needs to persist; poster images come from the metadata provider (spec 4). |
| Cache | None | No measured problem yet; add after profiling. |
| Hosting | Vercel (Hobby plan) with function region `iad1` set in `vercel.json`, and Neon on AWS `us-east-1` | Native Next.js host, preview deploy per branch, built in cron. |
| Source and CI | GitHub, GitHub Actions running lint, type check, build, and tests | Vercel deploys from GitHub; Actions are free at this size. |
| Testing | Vitest for unit and integration tests; Playwright with `@axe-core/playwright` for end to end and accessibility scans | Real database tests on a Neon test branch, and the automated accessibility scan feature 18 needs. |
| Local development | A Neon dev branch per developer, plus a separate branch for tests | Same Postgres and pgvector as production with nothing to install. |
| Observability | Structured JSON logs to Vercel logs for now | Error monitoring and product analytics are specced in feature 10. |
| Movie data and streaming data | Not decided here | Decided in specs 4 and 16. See the TMDB terms note in Follow-up. |

**Conventions the build must honor**

- Server Components by default. Add `"use client"` only for interactive pieces (the swipe deck, forms with client state).
- Only server code touches the database or reads secrets. No database access from client components. Ratings content never goes to analytics or logs.
- Every Server Action and Route Handler validates its input with Zod and checks the signed in user before touching data.
- Each stored embedding records its model name and dimension, so vectors can be regenerated if the model changes.
- Schema changes go through Drizzle migrations only. Run migrations against Neon's direct (unpooled) connection; the app uses the pooled connection.
- All database code runs on the Node.js runtime, never the edge runtime. One shared pool module serves the app and is passed to Better Auth's Drizzle adapter (rating writes and imports need transactions).

## Foundation settings

Settled after an independent cross check. Each is a pick, not an open question.

**Auth and data**
- Better Auth tables: generate the Drizzle schema once with the Better Auth CLI (`generate`), commit it as `src/db/auth-schema.ts`, and let `drizzle-kit` own every migration. Never use the Better Auth CLI `migrate`. Keep its default text ids; every app foreign key to `user.id` is a text column with `ON DELETE CASCADE`.
- Driver: `pg` Pool with `drizzle-orm/node-postgres` on the Node.js runtime, one shared pool module, also passed to Better Auth's `drizzleAdapter`.
- Sessions: add the Better Auth `nextCookies()` plugin so Server Actions can set cookies. Rely on Next's Origin check for Server Actions and Better Auth's own origin check for its routes. In Next 16, `proxy.ts` (the renamed middleware) only redirects when no session cookie exists. The real check is `auth.api.getSession({ headers })` in every page, action, and handler.
- Time and place: store every timestamp as UTC `timestamptz`. Default the country from the `x-vercel-ip-country` header, with a user override saved on the profile. The browser sends its timezone with each search.

**Environments**
- Migrations run in the build command `pnpm db:migrate && next build`, using `DATABASE_URL_UNPOOLED`. Install the Neon Vercel integration so each preview gets its own Neon branch, migrated by its own build and pruned on merge. Migrations must stay backward compatible, because one can apply even when the build then fails.
- Name one production domain now (Resend SPF and DKIM need it). Previews derive the base URL from `VERCEL_URL`. Better Auth `trustedOrigins` holds the production domain and the project's `*.vercel.app` pattern. Previews send email only through Resend's test sender, which delivers only to your own address.
- Env loading: one server only `src/env.ts` parses `process.env` with Zod at boot. A committed `.env.example` lists every name.
- Cache Components: leave `cacheComponents` off. Personal pages are dynamic.

**Abuse and cost limits**
- Better Auth `rateLimit: { enabled: true, storage: "database" }`. The default in memory store does nothing on serverless.
- Turnstile captcha (Better Auth captcha plugin) on sign up and password reset. Email verification is required.
- Mood search is for signed in users only, with a small Postgres fixed window limit (30 a day per user). Set a hard monthly spend cap in the embeddings provider dashboard.
- If the embeddings API fails, mood search falls back to Postgres full text only.

**Heavy work**
- Catalog embeddings: a local script `pnpm embed:catalog`, run from your machine against the target branch, about 100 movies per call, idempotent per movie and model. The daily catalog cron embeds only new rows, with a per run cap well inside the time limit. Spec 4 owns the catalog.
- Letterboxd import: a Route Handler only (Server Actions accept 1 MB bodies by default and Vercel functions 4.5 MB). Accept `ratings.csv` only, not the full export zip. Cap size at 2 MB, set `export const maxDuration = 60`, and use one batched insert in one transaction. Never call the metadata API per row inline; unmatched rows are reported, not looked up.
- Cron on Hobby: daily only, timing approximate, production only.

**Configuration required** (names only; values go in Vercel env vars and a gitignored `.env.local`, with a committed `.env.example`)

- `DATABASE_URL`: Neon pooled connection string, used by the app.
- `DATABASE_URL_UNPOOLED`: Neon direct connection string, used by migrations.
- `DATABASE_URL_TEST`: Neon test branch, reset per test run.
- `APP_DOMAIN`: the production domain, used for `trustedOrigins` and email.
- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`: captcha on sign up and reset.
- `BETTER_AUTH_SECRET`: signing secret for sessions.
- `BETTER_AUTH_URL`: the app's base URL per environment.
- `RESEND_API_KEY` and `EMAIL_FROM`: sending email.
- `VOYAGE_API_KEY`: embeddings.
- `CRON_SECRET`: authenticates cron requests to Route Handlers.
- A movie data API key, added by spec 4.

## Consequences

**Positive**:
- One codebase, one deploy, one database. One person can hold the whole system in their head.
- Auth, ratings, taste signals, and vectors share one Postgres, so exporting and deleting a user's data is one set of queries and transactions.
- Each service has a free tier or free allowance, so launch cost is near zero (limits to verify).
- Branch per preview plus Neon branching gives safe schema experiments.

**Negative / tradeoffs**:
- Next.js is most polished on Vercel. Moving hosts later is possible but needs care with Next.js specific features.
- The Vercel Hobby plan is for non commercial use. Any future paid plan or ads means moving to a paid Vercel plan or another host.
- Better Auth is a young library. You own upgrades and the security of the integration; the GA tier means a security review of the sign in feature.
- A hosted embeddings API is an outside dependency, and search phrases leave our database. Spec 17 must list it as a data processor, along with Resend for email. If the API is down, mood search falls back to Postgres full text only.
- Serverless functions have cold starts and execution time limits (the import is capped at 60 seconds and 2 MB). Neon also adds a cold start on the first request after idle.
- Neon Free branch limits were not checked. A branch per developer, a test branch, and one per preview can hit a cap, so preview branches are pruned on merge.
- A migration can apply before a failed build, so migrations must stay backward compatible.
- Several third party Agent Skills are installed; they run with the agent's permissions. Review them.

**Neutral**:
- Drizzle needs raw SQL for vector ranking; that is expected.
- Embedding dimension is fixed per model and decided with the data model (spec 3).

## Follow-up

- [ ] Scaffold: `/develop` derives the scaffold steps from the Proposed stack; the empty app must boot locally and pass a build (feature 1 done when).
- [ ] This folder is not a git repo yet. Run `git init` and create the GitHub remote before the CI step.
- [ ] Verify before building: pgvector is enabled on the Neon project; Better Auth supports email and password, reset, and verify as needed for the GA sign in tier; Vercel Hobby terms (the design assumes daily cron only); the current Resend free tier; Voyage AI's current model name, dimension, and free allowance; Neon Free limits (branch count, compute hours, cold starts).
- [ ] The TMDB terms (opened during the landscape check) require a separate written agreement for any commercial use, ask for attribution, and limit caching to six months. Carry this into spec 4 (movie catalog) and spec 16 (where to watch). The JustWatch credit requirement for watch data was reported by secondary sources only; confirm with TMDB.
- [ ] Spec 3 (data model) must store embedding model and dimension, and cover auth tables from Better Auth (text ids, `ON DELETE CASCADE`) in the export and delete design.
- [ ] Spec 17 (privacy) lists data processors: Resend (email addresses) and Voyage AI (search phrases).
- [ ] Spec 10 decides error monitoring and analytics. Sentry and PostHog were candidates; their free tier limits were not verified.
- [ ] Agent Skills: `better-auth-best-practices` belongs in `src/auth/AGENTS.md` and `resend` in `src/email/AGENTS.md`. The other nine skills are project wide and belong in root `AGENTS.md` under `## Agent skills`. A `github-actions` skill was installed by mistake (it targets React Native builds) and removed; add a web CI skill later if wanted. The `deploy-to-vercel` skill carried a Medium risk rating from one scanner (Snyk); review before use.
- [ ] Consider adding the Better Auth `email-and-password-best-practices` and `better-auth-security-best-practices` skills when building sign in (GA tier).
- [ ] Neon MCP server (official) was picked. Connecting it is a manual step in your MCP settings (for example `claude mcp add`); Neon documents the remote server at `https://mcp.neon.tech/mcp`. Use its read only mode against production data.
- [ ] Declined, so nothing offers them again: Vercel MCP, Next.js DevTools MCP, shadcn MCP.
- [ ] Run `/audit` after the scaffold so root `AGENTS.md` records this stack, the installed skills, and the declined list.

## Rationale

Reasoning, options, and references: see [rationale.md](rationale.md).

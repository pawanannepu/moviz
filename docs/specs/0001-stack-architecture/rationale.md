# 0001. Rationale: stack and architecture

Decision record for [index.md](index.md). The build does not read this file.

## Context

> ⚠️ Premise note: The plan says "free with no billing", and two chosen services tie their free use to that. Vercel's Hobby plan (from my knowledge, not re checked) is for non commercial use, and the TMDB terms (opened) require a separate written agreement for any commercial use, including ads. If paid plans ever return from the Deferred list, both need revisiting. The stack still fits today, so this is a flag, not a change of direction.

Moviz is a public, responsive web app for film fans. A user signs in with email, brings their taste in by swiping or by importing a Letterboxd CSV, and gets a feed where each pick says why it was chosen. A short phrase like "something short and funny tonight" returns a few picks. The catalog is a few thousand movies.

The builder is one person with no deadline. The delivery approach is Tracer Bullet: the first slice must already run through every layer (sign in, swipe, feed), so the stack has to be real from day one rather than swapped later. Sign in and privacy work are GA tier because they hold personal data, so user data needs to be exportable and deletable, and the sign in stack needs a security review.

Not deciding now means the first slice would be built on guesses and moved later. The data model, catalog, and design system specs all depend on the database, language, and framework being settled first.

Workload shape: small writes (ratings), read heavy feed queries, one CSV import path, and one similarity search path. Nothing here needs a stream processor, a message broker, or more than one service. Picks are aligned to the engineer's answers, and the project has no `AGENTS.md` yet, so nothing existing constrains the stack (greenfield).

## Options considered

### Option 1: Next.js monolith on Neon Postgres, hosted on Vercel (chosen)

One Next.js app, Postgres with pgvector on Neon, Drizzle, Better Auth in the app, Resend, hosted embeddings, Vercel hosting.

**Pros**:
- One deployable and one database. Fewest moving parts.
- Vectors, ratings, and auth live together, so export and delete are simple.
- Portable parts: plain Postgres, a library for auth, no vendor SDK in the data path.
- Largest ecosystem for the swipe deck and accessible UI components.

**Cons**:
- Best experience is tied to Vercel; Hobby terms are non commercial.
- Better Auth is young; the integration is yours to maintain.
- Serverless limits (cold starts, execution time) shape how imports are written.

### Option 2: Next.js on a backend as a service (Supabase for Postgres, auth, storage)

Same front end, but the database, auth, and storage come from one vendor with row level security.

**Pros**:
- Fewer pieces to wire; auth and database come from one vendor.
- Row level security can enforce ownership in the database.

**Cons**:
- Pulls the app toward the vendor's SDK and auth; harder to leave.
- Ranking and vector logic still lives in app code, so the BaaS gives less than it seems.
- Row level security rules are another place for mistakes and need their own testing.

### Option 3: Separate SPA plus API service

A client side React app and a standalone Node API on a container host, with Postgres.

**Pros**:
- Clean line between front end and back end; a future native app can reuse the API.
- Full runtime control on a container host; no serverless limits.

**Cons**:
- Two deployables, two builds, CORS and session handling to own.
- More glue for one person, and usually no free hosting.
- Native mobile is deferred, so the main benefit is not needed yet.

### Option 4: Cloudflare first (Workers with a Workers compatible framework)

Run the app on Cloudflare Workers, with a Postgres connection through Hyperdrive or D1.

**Pros**:
- Generous free tier and global edge.
- One vendor for hosting and some storage.

**Cons**:
- Workers runtime limits and adapter quirks can break Node libraries such as auth and database drivers.
- D1 is SQLite and was reported to lack pgvector (unverified), which would undo the in database embeddings plan.
- Less documented path for the chosen framework and libraries.

## Rationale

Option 1 fits the forces in Context. A single person with no deadline is best served by a monolith: it is the simplest thing to build, deploy, and debug, and extracting a service later is possible while merging services back is not. The workload is relational (users, movies, ratings, lists) so Postgres is the right default, and pgvector turns "mood search" into a query in the same database instead of a second system. That also makes the GA privacy requirement (export and delete everything for a user) a set of transactions in one place.

Next.js was picked for ecosystem depth. The swipe deck and accessible components (WCAG AA is a stated goal) have the most mature options in the React world, and the installed community skills for this stack are strongest here. The runner up was React Router v8 in framework mode, which is more portable across hosts. TanStack Start was ruled out only on age: it declared 1.0 stable on 2026-10-13, three weeks before this spec. Next.js carries one real cost, which is its pull toward Vercel, accepted knowingly.

Better Auth over a hosted provider keeps user data in our own database and avoids a vendor limit on a free product. Over Auth.js it avoids a library now in security patch only maintenance, and Lucia is deprecated. The cost is that the library is young and the GA tier needs a security review of the integration. The runner up is a hosted provider (Clerk), which removes that work but puts user data with a vendor and has unverified free limits.

Neon over Supabase keeps the data path plain Postgres. Drizzle over Prisma is chosen because the recommender needs real SQL and vector queries, which Drizzle treats as first class. Vercel over a container host is chosen because a small team should use a managed platform instead of operating its own; the runner up is Fly.io or Railway if Vercel's terms or limits block you. Embeddings come from a hosted API because a small model in a serverless runtime is awkward. The cross check found that OpenAI has no free tier (prepaid credit only), which broke the "free product" constraint, so Voyage AI is the default (it was reported to have a free token allowance, unverified) with OpenAI as runner up. The model name, dimension, and allowance must be checked when building.

Items settled by recommendation, with the runner up each time:
- Zod for validation (runner up: Valibot) because it is the common default and the skills assume it.
- Server Components first, no static generation work, because SEO is not a goal.
- No cache, no queue, no file storage now, because nothing measured needs them (premature optimisation is a known failure pattern).
- Vercel Cron plus inline import over a job queue, because matching against a local catalog is fast.
- Structured logs now, with monitoring deferred to feature 10, because that feature exists in the scope.
- The "Foundation settings" in `index.md` (auth table ownership, driver, sessions, migrations timing, environments, abuse limits, import limits, tests) came from an independent cross check on a different model, and each was accepted as recommended.

## Evidence: landscape check (2026-11-05)

A capped web check ran once during design. Full notes are in `docs/.agent-cache/research/moviz-stack-landscape.md`. What it confirmed and what it did not:

- Confirmed from registries: Next.js 16.4.5, React Router 8.5.1, Drizzle ORM 0.45.4, Better Auth 1.7.18.
- Confirmed from an opened page: TanStack Start 1.0 stable (2026-10-13). TMDB terms: commercial use needs a written agreement, attribution is required, cache at most six months.
- Search snippets only (verify): Neon and Supabase support pgvector with HNSW; Auth.js is in security patch only maintenance and joined the Better Auth project; Lucia is deprecated; Better Auth supports email and password, magic link, and reset.
- Not researched (from my knowledge, verify): hosting free tiers, Prisma, Kysely, SvelteKit, Clerk, Supabase Auth, Resend limits, embeddings pricing, Sentry and PostHog limits.
- One unverified single source claim (a Vercel acquisition of Better Auth) was not used in the decision.

Agent Skill and MCP discovery notes are in `docs/.agent-cache/tool-discovery/moviz-stack.md`. Twelve skills were installed into `.claude/skills/` (copied, not linked). One (`github-actions`, a React Native build skill) was removed after the cross check, leaving eleven.

## References

**Project sources** (verifiable, in this repo):
- `docs/scope/scope.md`: feature 1, the decisions behind the plan, Tracer Bullet approach, Beta workflow, GA tags on sign in and privacy.
- Installed skills in `.claude/skills/` (listed in the Decision section of `index.md`).

**Practices & standards**:
- Monolith first; extract services only for a measured bottleneck or team ownership boundary.
- A relational database as the default for relational data.
- Use a proven auth library instead of building authentication.
- Avoid premature optimisation: no cache or queue before measurement.
- Least privilege and server only secrets for the data path.

**Links** (web verified during the landscape check):
- TanStack Start 1.0 announcement: https://tanstack.com/blog/tanstack-start-1-0
- Next.js on npm: https://registry.npmjs.org/next/latest
- React Router on npm: https://registry.npmjs.org/react-router/latest
- Drizzle ORM on npm: https://registry.npmjs.org/drizzle-orm/latest
- Better Auth on npm: https://registry.npmjs.org/better-auth/latest
- TMDB API terms of use: https://www.themoviedb.org/api-terms-of-use

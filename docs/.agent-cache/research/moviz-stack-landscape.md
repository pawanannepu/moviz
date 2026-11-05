# Moviz stack landscape (as of 2026-11-05)

Research budget used: 5 searches, 8 page fetches. Items marked "unverified" were not opened; they come from memory or search snippets only. npm versions were read from registry.npmjs.org on 2026-11-05.

Search-snippet sources (secondary blogs, not opened) are labeled "seen in search" below.

## 1. Full-stack TypeScript frameworks

| Option | Latest version | Best at | Caveat | URL |
|---|---|---|---|---|
| TanStack Start | 1.x stable (RC in Sept 2025; declared stable 2026-10-13 per official post) | Type-safe routing and server functions, Vite-based, clean router-first model | Upgrade needs Vite 8 and migration of deprecated APIs (e.g. `.inputValidator()` to `.validator()`, per secondary source only) | https://tanstack.com/blog/tanstack-start-1-0 (opened, confirmed stable) |
| Next.js | 16.4.5 | Largest ecosystem, RSC, Vercel-native deploys | Heavier, Vercel-centric defaults, frequent API churn | https://www.npmjs.com/package/next (npm registry opened, version confirmed; official site nextjs.org unverified) |
| React Router (v7) | 8.5.1 on npm `react-router` | Remix successor, framework mode, minimal learning curve from Remix | Major-version naming shifted; verify current framework-mode docs before starting | https://registry.npmjs.org/react-router/latest (opened); reactrouter.com unverified |
| SvelteKit / Nuxt | not checked | Strong alternatives if not using React | Outside React ecosystem; not researched for this pass | unverified |

Freshness: TanStack Start is out of RC. Official post at tanstack.com (opened) says it is "finally stable" and dated Tuesday, Oct 13, 2026. Breaking-change details (Vite 8, validator rename) came only from a secondary source (Appwrite blog, seen in search, https://appwrite.io/blog/post/tanstack-start-stable-appwrite-sites); the official post I opened did not list them.

Note: the npm package `@tanstack/react-start` reported version 1.169.4 on its `latest` tag. This looks like a monorepo-style version number and may not match the framework's "1.0" milestone naming. Check the release page before pinning.

## 2. Database, ORM, managed Postgres

| Option | Latest version | Best at | Caveat | URL |
|---|---|---|---|---|
| Drizzle ORM | 0.45.4 (npm `drizzle-orm`) | SQL-like typed queries, lightweight, good on serverless | Migrations workflow is less automatic than Prisma's | https://registry.npmjs.org/drizzle-orm/latest (opened); orm.drizzle.team unverified |
| Prisma | not checked | Mature schema-first DX, large community | Heavier runtime; not verified for this pass | unverified |
| Kysely | not checked | Type-safe query builder, no codegen | No schema-migration tooling; you pair it with another tool | unverified |
| Neon (managed Postgres) | n/a | Serverless Postgres, scale-to-zero, pgvector preinstalled (per secondary source) | Source said pgvectorscale StreamingDiskANN is not available; verify | unverified (no official page opened) |
| Supabase (managed Postgres) | n/a | Postgres plus auth/storage, pgvector with HNSW and IVFFlat (per secondary source) | Pulls you toward its own auth/platform if you use more of it | unverified (no official page opened) |
| Cloudflare D1 | n/a | SQLite at the edge, fits Workers | SQLite, not Postgres; pgvector not applicable | unverified |

pgvector: both Neon and Supabase reportedly support it (seen in search, not confirmed from their docs). Secondary sources cited version 0.5.x, which is almost certainly outdated; check the actual version on the instance.

## 3. Email-only auth

| Option | Status | Email+password | Magic link | Password reset | URL |
|---|---|---|---|---|---|
| Better Auth | npm `better-auth` 1.7.18, active (last commit reported May 2026 in a secondary source) | Yes (per secondary sources) | Yes (per secondary sources) | Yes (per secondary sources) | https://registry.npmjs.org/better-auth/latest (opened, version confirmed); github.com/better-auth/better-auth unverified |
| Auth.js (NextAuth) | Security-patch-only maintenance; Sept 22, 2025 announced as joining Better Auth (seen in search) | Limited without a DB adapter, check current docs | Yes | Via adapter | unverified (authjs.dev not opened) |
| Lucia | Deprecated; maintainer said v3 deprecated by March 2025 and it became a learning resource (seen in search, citing GitHub discussion #1714) | n/a | n/a | n/a | unverified; do not use for new code |
| Clerk / Supabase Auth | Hosted providers, not researched in depth | Yes | Yes | Yes | unverified |

Recommendation from sources: Better Auth for new TypeScript apps. Its email+password, magic link, and reset flows need confirming in its docs before committing, since the support claims here come from secondary blogs.

Claim to verify: one secondary source says Vercel acquired Better Auth on 2026-07-07. Single source, unverified, do not rely on it.

## 4. Movie metadata and "where to watch"

TMDB (https://www.themoviedb.org/api-terms-of-use, opened and confirmed):
- Commercial use is NOT covered by the free license. Charging fees, earning revenue from a site that uses TMDB content, or training AI models requires a separate written agreement, and commercial use without one is a material breach.
- Non-commercial use falls under the free license with conditions.
- Attribution: must use the TMDB logo, displayed less prominently than your own branding, and include a notice that the product uses TMDB but is not endorsed or approved by TMDB.
- Caching: no longer than 6 months; purge on license end.
- Rate limits: not verified in this pass.
- Practical read for Moviz: a free, no-billing product is still a grey area if it has ads, sponsorship, or any monetization path. Get the commercial-use question answered by TMDB before launch.

Watch providers:
- TMDB watch provider data is from JustWatch and reportedly refreshes daily (seen in search, from a TMDB community forum and a third-party wrapper). Secondary sources say you must credit JustWatch in any UI showing providers. The TMDB terms page I opened did not mention JustWatch, so treat the JustWatch credit as a requirement to confirm in TMDB's documentation.
- Known gap: some countries can miss categories such as flatrate (TMDB community thread, seen in search).

Other options:
- OMDb: not researched in this pass. unverified.
- Streaming Availability API: not researched in this pass. Attribution and pricing unverified.

## 5. Hosting and monitoring

Hosting (Vercel, Cloudflare Workers, Fly.io, Railway, Render): not researched in this pass (search budget spent). No free-tier claims are confirmed here. unverified.

Error monitoring and analytics (secondary sources only, not opened from vendor pages):
- Sentry Developer plan: free for one user, about 5,000 error events per month (seen in search, conflicting span figures). Next paid tier, Team, about $26/month for 50,000 errors. Verify on sentry.io/pricing (unverified).
- PostHog free tier: reportedly 100,000 error/exception events per month, with no credit card (seen in search). The posthog.com/pricing page I opened returned only navigation and did not show limits, so these numbers are unverified from the vendor. Source: https://posthog.com/pricing (opened, numbers not shown).

Freshness: no pricing source in this pass was dated within the last few weeks. Re-check both pricing pages before deciding.

## Confirmed URLs (opened or fetched this session)
- https://tanstack.com/blog/tanstack-start-1-0
- https://www.themoviedb.org/api-terms-of-use
- https://registry.npmjs.org/@tanstack/react-start/latest
- https://registry.npmjs.org/better-auth/latest
- https://registry.npmjs.org/drizzle-orm/latest
- https://registry.npmjs.org/next/latest
- https://registry.npmjs.org/react-router/latest
- https://posthog.com/pricing (opened; limits not rendered)

## Seen in search results (not opened)
- https://appwrite.io/blog/post/tanstack-start-stable-appwrite-sites (secondary)
- https://www.wisp.blog/blog/lucia-auth-is-dead-whats-next-for-auth (secondary)
- https://github.com/better-auth/better-auth (not confirmed as opened)

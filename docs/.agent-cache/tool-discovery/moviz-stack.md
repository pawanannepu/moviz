# Moviz stack: skill and MCP discovery

Date: 2026-11-05
Scope: Next.js (App Router), React, TypeScript, Drizzle ORM, Neon (Postgres, pgvector), Better Auth, Resend, Tailwind CSS, shadcn/ui, Vercel, pnpm, GitHub Actions.

Method: `npx skills list` (no project skills installed), `npx skills find <tool>`, then `npx skills add <owner>/<repo> --list` for repo confirmation (list only, nothing installed). MCP via web search (9 of 12 budget used).

Installed: none. Declined: none.

Legend: [confirmed] = listed by `skills add --list`. [find-only] = seen in `skills find` output, not listed.

---

## Next.js (App Router)

Skills:
- vercel-labs/openreview@next-best-practices [find-only] - general Next.js best practices. (Not Vercel's main repo; openreview org.)
- wshobson/agents@nextjs-app-router-patterns [confirmed] - App Router patterns (routing, server/client components, data fetching). Popular (33K installs).
- giuseppe-trisciuoglio/developer-kit@nextjs-app-router [confirmed] - App Router guidance.
- giuseppe-trisciuoglio/developer-kit@nextjs-deployment [confirmed] - deployment guidance.
- giuseppe-trisciuoglio/developer-kit@nextjs-authentication [confirmed] - auth patterns in Next.js (check overlap with Better Auth).

MCP:
- next-devtools-mcp (OFFICIAL, Vercel) - https://github.com/vercel/next-devtools-mcp ; docs https://nextjs.org/docs/app/guides/mcp - exposes the Next.js 16+ dev server MCP endpoint (/_next/mcp) to coding agents. Needs Node 20.19+ and a running dev server.

## React

Skills:
- vercel-labs/agent-skills@vercel-react-best-practices [confirmed] - React/Next.js performance guidelines from Vercel Engineering (873K installs).
- vercel-labs/agent-skills@vercel-composition-patterns [confirmed] - component composition, React 19 APIs.
- giuseppe-trisciuoglio/developer-kit@react-patterns [confirmed] - general React patterns.
- hairyf/skills@react [find-only] - React guidance.

MCP: none searched (search budget reached). Not checked.

## TypeScript

Skills:
- wshobson/agents@typescript-advanced-types [confirmed] - advanced type patterns (97K installs).
- giuseppe-trisciuoglio/developer-kit@typescript-docs [confirmed] - TypeScript documentation guidance.
- jeffallan/claude-skills@typescript-pro [find-only] - broad TypeScript expert guidance.

MCP: none searched (search budget reached). Not checked.

## Drizzle ORM

Skills:
- giuseppe-trisciuoglio/developer-kit@drizzle-orm-patterns [confirmed] - Drizzle schema, queries, migrations (5.6K installs).
- bobmatnyc/claude-mpm-skills@drizzle-orm [find-only] - Drizzle ORM guidance (4.3K installs).
- mindrally/skills@drizzle-orm [find-only] - Drizzle ORM guidance.

MCP (community only, no official Drizzle MCP found):
- defrex/drizzle-mcp (community) - https://lobehub.com/en/mcp/defrex-drizzle-mcp - Drizzle migrations, drizzle-kit commands, introspection, raw SQL. Maintenance and tool list unverified; check the repo.
- cdifulv/drizzle-orm-mcp (community) - https://lobehub.com/fr/mcp/cdifulv-drizzle-orm-mcp - searchable Drizzle docs plus code generation (PostgreSQL/MySQL/SQLite). Docs-only, no DB access.

## Neon (serverless Postgres, pgvector)

Skills:
- neondatabase/agent-skills@neon-postgres [confirmed] - official Neon skill (303K installs). Covers Postgres usage on Neon.
- neondatabase/agent-skills@neon [confirmed] - official Neon platform skill.
- neondatabase/agent-skills@neon-postgres-branches [confirmed] - branch workflows, useful for preview deployments.
- neondatabase/agent-skills@neon-postgres-egress-optimizer [find-only] - cost/egress optimization.
- pgvector coverage: not separately confirmed; neon-postgres is the closest match.

MCP (OFFICIAL, Neon):
- Neon MCP server - remote https://mcp.neon.tech/mcp (OAuth, preview) or local npm package @neondatabase/mcp-server-neon; source github.com/neondatabase/mcp-server-neon (some listings show neondatabase-labs). Docs/announcement: https://neon.com/blog/announcing-neons-remote-mcp-server . Read-only via `X-Neon-Read-Only` header. Neon warns it is not recommended for production.

## Better Auth

Skills:
- better-auth/skills@better-auth-best-practices [confirmed] - official Better Auth skill (130K installs).
- better-auth/skills@better-auth-security-best-practices [confirmed] - security guidance (50K).
- better-auth/skills@email-and-password-best-practices [confirmed] - email/password flows.
- better-auth/skills@two-factor-authentication-best-practices [confirmed] - 2FA.
- better-auth/skills@organization-best-practices [confirmed] - organizations/teams.
- better-auth/skills@create-auth [confirmed] - scaffolding helper.
- giuseppe-trisciuoglio/developer-kit@better-auth [confirmed] - community guidance (secondary).

MCP:
- No official Better Auth MCP server found.
- better-auth-mcp-server (community) - listed on lobehub/playbooks (e.g. https://lobehub.com/en/mcp/better-auth-mcp-server-better-auth-mcp-server) - auth analysis and migration planning. Claims unverified, AGPL-3.0 licence; treat as unverified.

## Resend

Skills:
- resend/resend-skills@resend [confirmed] - official Resend skill (24K installs).
- resend/resend-skills@resend-cli [confirmed] - official CLI skill.
- resend/resend-skills@email-best-practices [confirmed] - official deliverability and sending guidance. (Also listed under resend/email-best-practices@email-best-practices, find-only.)
- resend/react-email@react-email [find-only] - official React Email templates skill (9.9K installs).
- resend/resend-skills@agent-email-inbox [confirmed] - inbox/receiving; likely not needed for moviz.

MCP (OFFICIAL, Resend):
- Resend MCP server - hosted https://mcp.resend.com/mcp (OAuth, Streamable HTTP) or local npm `resend-mcp`; source github.com/resend/resend-mcp. Docs: https://resend.com/docs/mcp-server and changelog https://resend.com/changelog/mcp . Covers emails, contacts, domains, webhooks, and more.

## Tailwind CSS

Skills:
- hairyf/skills@tailwindcss [confirmed] - Tailwind guidance (4K installs).
- giuseppe-trisciuoglio/developer-kit@tailwind-css-patterns [confirmed] - Tailwind patterns (18K installs).
- giuseppe-trisciuoglio/developer-kit@tailwind-design-system [confirmed] - design system tokens and components.
- josiahsiegel/claude-plugin-marketplace@tailwindcss-advanced-layouts [find-only] - layouts.

MCP: no official Tailwind Labs MCP found. Community only (not checked for quality): dougjaworski/tailwind-mcp (docs search and utility-class lookup), CarbonoDev/tailwindcss-mcp-server. Not recommended without review.

## shadcn/ui

Skills:
- shadcn-ui/ui@shadcn [find-only, but repo confirmed] - OFFICIAL shadcn skill (408K installs). Listed in shadcn-ui/ui repo --list.
- shadcn-ui/ui@migrate-radix-to-base [confirmed] - official migration skill (only relevant if upgrading Radix).
- giuseppe-trisciuoglio/developer-kit@shadcn-ui [confirmed] - community guidance (23K installs).

MCP (OFFICIAL per Shadcnblocks docs, not independently confirmed): the shadcn CLI provides MCP (`shadcn mcp init`, runs `npx shadcn@latest mcp`). Official docs URL not captured in search; check ui.shadcn.com. Community alternatives: ymadd/shadcn-ui-mcp-server, shadcn-docs-mcp (PyPI) - unofficial.

## Vercel (hosting)

Skills:
- vercel-labs/agent-skills@deploy-to-vercel [confirmed] - OFFICIAL Vercel deployment skill (183K installs).
- vercel-labs/agent-skills@vercel-cli-with-tokens [confirmed] - Vercel CLI with tokens (for CI).
- vercel-labs/agent-skills@vercel-optimize [confirmed] - optimization guidance.

MCP (OFFICIAL, Vercel):
- Vercel MCP server - hosted https://mcp.vercel.com ; docs https://docs.vercel.com/docs/mcp/vercel-mcp . OAuth, read-only access to docs, logs and project metadata (public beta). A local npm `@vercel/mcp-server` is mentioned by third parties only; unverified.

## pnpm

Skills:
- antfu/skills@pnpm [confirmed] - pnpm guidance (22.7K installs).
- hairyf/skills@pnpm [find-only] - pnpm guidance.
- mindrally/skills@pnpm [find-only] - pnpm guidance (742 installs).

MCP: none searched (search budget reached). Not checked.

## GitHub Actions

Skills:
- callstackincubator/agent-skills@github-actions [confirmed] - GitHub Actions guidance (11.7K installs).
- wshobson/agents@github-actions-templates [confirmed] - workflow templates (18K installs).
- github/awesome-copilot@github-actions-hardening [find-only] - workflow hardening/security.
- github/awesome-copilot@github-actions-efficiency [find-only] - workflow speed/cost.

MCP (OFFICIAL, GitHub):
- GitHub MCP server - github/github-mcp-server (about 28K stars). Hosted remote endpoint api.githubcopilot.com/mcp/ or Docker ghcr.io/github/github-mcp-server. Repo is the authoritative doc. Note: a PyPI package also named `github-mcp-server` is not GitHub's project.

---

## Caveats
- Search budget used: 9 of 12 web calls (7 + 2). React, TypeScript, pnpm MCP and the Drizzle/shadcn official docs URLs were not checked.
- Skill popularity numbers come from the registry at search time and are not a quality guarantee.
- Community MCP servers are unverified; none were installed.

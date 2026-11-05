# Moviz

A movie recommendation web app for film fans. The plan lives in `docs/scope/scope.md` and the stack decision in `docs/specs/0001-stack-architecture/index.md`.

Stack: Next.js (App Router) and TypeScript, Tailwind CSS, pnpm. Postgres on Neon, Drizzle, Better Auth, and Resend arrive with the features that need them.

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm typecheck  # TypeScript, no emit
pnpm build      # production build
```

Needs Node.js 22 or newer. Copy `.env.example` to `.env.local` when a feature asks for a value.

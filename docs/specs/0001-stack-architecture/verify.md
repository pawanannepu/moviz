# Verify: Stack & architecture · spec 0001 · updated 2026-11-05
_Steps derived from the feature's "Done when" in `docs/scope/scope.md` (spec 0001 has no numbered acceptance criteria, so they are labelled DW-1 and DW-2) and from the spec's conventions. `/check verify` can run these._

## UI / manual
- [ ] Run `pnpm dev`, open http://localhost:3000 → the page shows "Moviz" and "Movie picks that tell you why. Coming soon." with no console errors → DW-2
- [ ] Switch the OS to dark mode and reload → text stays readable on the dark background → DW-2

## Commands
- [ ] `pnpm install` → completes with no errors, using Node 22 or newer → DW-2
- [ ] `pnpm typecheck` → exits 0 (runs `next typegen` first so the generated route types exist) → DW-2
- [ ] `pnpm build` → "Compiled successfully", routes `/` and `/_not-found` listed → DW-2
- [ ] `pnpm start -p 3123` then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3123/` → `200` → DW-2
- [ ] Open `next.config.ts` → `cacheComponents` is not set (spec: personal pages are dynamic) → DW-1
- [ ] Open `vercel.json` → `regions` is `["iad1"]` (spec hosting row) → DW-1
- [ ] `git check-ignore .env.local` prints the path, and `git check-ignore .env.example` prints nothing → DW-1

## Acceptance-criteria coverage
- DW-1 (stack recorded in a spec) · covered by the spec itself plus the config checks above (Cache Components off, region, `.env.example` tracked)
- DW-2 (scaffold boots locally and passes a build) · covered by install, typecheck, build, start, and the page check

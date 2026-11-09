# 0005. Email sign in: decision record

Build spec: [index.md](index.md)

## Context

> ⚠️ Premise note: spec 0001 said "Server Actions mutate" and the first design for this feature had the forms call Better Auth through Server Actions. Checking the installed Better Auth 1.7.18 source showed that its rate limiter runs only inside its HTTP router, and its captcha plugin only in `onRequest`, so a Server Action calling `auth.api` directly skips both. That would have left sign up, sign in, and reset with none of the abuse limits spec 0001 promises, and nothing would have shown it. The forms therefore call the library's routes.

Moviz needs real accounts: ratings, taste, watchlists, and imports are personal and must be exportable and deletable (spec 0002). The scope sets email only sign in, a public product, a solo builder, no deadline, and the GA tier because the feature holds personal data. Spec 0001 already settled the library (Better Auth), email (Resend), captcha (Turnstile), database backed rate limits, and required email verification. Spec 0002 settled the tables, the profile row created at sign up, and the account delete cleanup.

What was left open is how people actually move through it: what sign up asks for, what verification does, how long a session lasts, how long links live, what the system reveals about which emails exist, where users land, how forms reach the server, and how pages are protected. The cost of leaving these open is a build that guesses them, and guesses in auth tend to become vulnerabilities.

The project runs on serverless functions, so in memory state (default rate limits, cached sessions) does not work. A film fan uses this app weekly from a phone, so a short session or a hard password rule costs real visits. There is no production domain yet, which limits real email to development and preview until one exists.

## Options considered

### Option 1: Forms call Better Auth's routes through its browser client (chosen)

Client forms validate with Zod, then call `/api/auth/*` with the Better Auth client. The library applies its origin check, rate limits, and captcha, and sets the cookie on its own response. Server pages read the session with `auth.api.getSession`.

**Pros**:
- Rate limits and captcha run as the library tested them.
- Least custom security code; cookies need no extra plugin.
- Library behaviours (neutral responses, token handling) come with it.

**Cons**:
- Forms need JavaScript.
- Input checks live in the browser and in the library, not in a Server Action of ours.
- Library error codes must be mapped to plain messages in one place.

### Option 2: Server Actions that call `auth.api`, with our own Turnstile check and rate limiter

Keeps the project's usual Server Action pattern and typed results at the edge. We would write the Turnstile verification and a Postgres rate limiter ourselves, because the library's do not run on direct calls.

**Pros**:
- Matches the rest of the project's pattern; forms work without JavaScript.
- Full control of the messages.

**Cons**:
- We own two security features that already exist in the library, and they can drift from it.
- More code and more tests; a bug in our limiter is silent.

### Option 3: Server Actions that build a Request and call `auth.handler`

Runs the full library pipeline from a Server Action by constructing a `Request` and copying `Set-Cookie` headers back.

**Pros**:
- Keeps Server Actions, Zod at the edge, and the library's protections.

**Cons**:
- Hand built requests and header copying are unusual and easy to get subtly wrong, such as cookie flags or the client IP.
- Fewer examples to follow, so harder for the next person to read.

## Rationale

Option 1 wins on the forces in Context: a solo builder with a GA tier feature should own as little security code as possible, and the library already implements the limits and the bot check. The abuse limits are the part of this feature that fails silently, so using the path where they provably run (found by reading the installed source, not assumed) matters more than keeping one pattern. Option 2 would work but swaps a tested limiter for ours; Option 3 keeps the protections but adds a fragile adapter.

The engineer first picked Server Actions, then moved to Option 1 once the bypass was shown. The cost they accepted: auth forms are client components, and the project rule that every Route Handler validates with Zod has one documented exception (the library's own route).

The settings follow the same thinking. A 30 day rolling session fits weekly use. Reset links last 15 minutes, because an old email in an inbox is a risk, while verification links last 24 hours, because people sign up on a phone and open the email later. Passwords need 8 characters with no breach check, which is the library default and keeps sign up simple; the engineer chose that over a longer rule or a breached password check, and the tradeoff is that common passwords are allowed. No account lockout, because a lockout lets anyone lock a known email out of its owner; rate limits per IP stop guessing without that. Neutral messages on sign up and reset, because the GA tier should not let anyone check who uses Moviz, at the cost of a little clarity. A password reset signs out every other device, so a stolen session does not survive it.

Two calls were made by the architect: the trusted origins list is exact (a `*.vercel.app` wildcard would trust any site on that host; runner up was a project scoped pattern, which Vercel's naming makes brittle), and `proxy.ts` only checks cookie presence while pages do the real check and the signed in redirects (runner up: redirect in the proxy, which loops on a stale cookie).

## Other calls made by the architect

| Call | Pick | Why | Runner up |
|---|---|---|---|
| Email templates | plain HTML and text pure functions | two emails, no dependency, easy to test | React Email |
| Turnstile widget | small own client component | one script tag and a callback; site key passed as a prop keeps `env.ts` the only reader | `@marsidev/react-turnstile` |
| Check your inbox state | in place on the form, email held in component state | no cookie, no email in a URL (it is personal data) | a `/check-email` page with a short lived cookie |
| Route guard | default deny allowlist in `proxy.ts` plus real checks in pages | a forgotten new page is closed, not open | per page checks only |
| Name field | derived from the email in a server hook | Better Auth requires one; never trusted from the client | ask for a display name |
| Cookie cache | off | revocation (sign out, reset, delete) works at once | short cache to save reads |
| Captcha endpoints | sign up and reset only | spec 0001; sign in is covered by the rate limit and a challenge there would hurt returning users | include sign in |
| Terms version | placeholder constant `pre-launch` | spec 17 owns real terms | none |
| Logging | structured lines to the platform log, no personal data | meets the audit need now without a new table | a durable audit table (deferred to spec 17) |
| Delete user | enable and wire the cleanup, no screen | spec 0002 asked this feature to wire it | leave it to spec 17 |
| Email on existing address | verified account: "you already have an account" with links; unverified account: a reset email | helps a forgetful real owner, leaks nothing to the visitor, and stops a stranger holding someone else's unverified account | send nothing |
| Session renewal | small client component calls `getSession` once per page load | a Server Component can extend the database row but cannot write the cookie | add `nextCookies()` and a Server Action |
| After sign in or out | full page navigation | the router cache cannot show a stale signed in or signed out page | `router.push` and refresh |
| Rate limit IP | default `x-forwarded-for` | Vercel overwrites it with one trusted value | a custom header |
| Turnstile hostname check | production host only | test keys report `example.com` and preview hosts change per deploy | allow a list of hosts |
| Preview base URL | `allowedHosts` with the deploy and branch hosts | people browse the branch alias | derive from `VERCEL_URL` only |
| Console email fallback | local development only | tokens must never reach hosted logs | allow on previews |
| Background email sends | one `backgroundTasks` handler using `after` | one place, and sends cannot delay or break a response | wrap each send call |
| Delete needs password | a `before` hook returns 400 without one | the library falls back to a one day fresh session check otherwise | rely on the fresh session check |

## Cross check

A read only review on a different model (GA tier) found 18 decision gaps, 8 soundness issues, and 4 wrong library claims. The engineer chose to apply all recommended fixes, and each is now in `index.md`: the gap fixes in the pages, API, auth config, value sourcing, and build plan; the wrong claims corrected (`X-Retry-After`, captcha status codes, `PASSWORD_TOO_SHORT`, how token rows are stored). The accepted residual risks are listed in the Security model and Consequences.

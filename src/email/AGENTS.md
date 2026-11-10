# src/email

Sends transactional email. Today that means the three auth emails from spec [0005](../../docs/specs/0005-email-sign-in/index.md). Nothing here knows about users or tokens: callers pass a finished link in.

## Files

- [send.ts](send.ts): `sendEmail(message)` delivers one email and returns a typed `EmailResult`. `pickTransport` is the pure choice of where it goes.
- [templates.ts](templates.ts): pure functions, a link in and a subject plus text and HTML out: `verifyEmailContent`, `resetPasswordContent`, `accountExistsContent`. `escapeHtml` is for anything placed in the HTML.

## Rules

- `sendEmail` never throws. A failed send must look the same to the caller as a good one, so an existing and an unknown email get identical responses (AC-14). Callers run it after the response is sent.
- Log only the reason a send failed. Never log the address, the subject or the content.
- Transport comes from the environment. With `RESEND_API_KEY` and `EMAIL_FROM` set it uses Resend. Without them, local development (`VERCEL_ENV` unset) prints the email to the server console, which is how you get links locally and how `e2e/auth` reads its inbox. On Vercel a missing sender stops the app at boot (`src/env.ts`), because printing a token would put it in hosted logs.
- Each template has one main link, no images and no tracking. The HTML is dark to match [design.md](../../design.md).

## Agent skills

- [resend](../../.claude/skills/resend/): `resend/resend-skills`, Resend email API

_Drafted by /sync from the introducing change, worth a quick human pass._

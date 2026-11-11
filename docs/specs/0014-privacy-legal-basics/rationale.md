# 0014. Privacy and legal basics: rationale

## Context

Moviz is a public product: anyone can sign up, from anywhere. It holds personal data (email, a full taste history, approximate location through country, IP addresses in rate limit rows) and sends some of it to processors (Neon, Vercel, Resend, Voyage AI, Cloudflare). Scope feature 17 carries the GA tier because of this. The scope names no legal regime, and the builder is solo with no legal team.

Much of the machinery already exists. Spec 0002 built `exportUserData` and `deleteAccount` with a completeness test that fails when a new user table is not wired into both. Spec 0005 wired Better Auth's `deleteUser` to `deleteAccount` and made the delete route require the current password. Sign up already stamps `terms_accepted_at` and a terms version, but the version is the placeholder `pre-launch` and there are no pages to agree to.

What is missing is the words and the screens: a policy and terms that say what really happens, links where people need them, and a page where a user can use their rights without emailing anyone. The operator's real name and contact email are details only the engineer can supply, and launching with blanks would make the policy worthless.

## Options considered

### Option 1: Minimal plain policy, delete by email

A short policy and terms, with "email us to export or delete".

**Pros**:
- Fastest to ship; no new screens.

**Cons**:
- Every request becomes manual work, and a slow reply breaks the promise.
- Weak for EU users, and the built export and delete functions go unused.

### Option 2: GDPR style policy and terms, with a self serve account page (chosen)

Static pages written to the strict common bar, plus `/account` to download data, change country and delete.

**Pros**:
- Users exercise their main rights themselves, instantly.
- Reuses tested functions; the new code is mostly screens and words.

**Cons**:
- Longer policy to write and keep true as features change.
- Still not a lawyer's work.

### Option 3: A hosted policy generator or consent platform

Use a third party service to generate and host the policy and manage consent.

**Pros**:
- Templates kept current by the vendor.

**Cons**:
- A new paid vendor and often a script on every page, for a site that sets no tracking cookies.
- Generic text that does not describe what Moviz actually does with ratings and search phrases.

## Rationale

Option 2 matches the engineer's choice of a GDPR style baseline and makes use of what spec 0002 and spec 0005 already proved: complete export, complete delete, and a password check. A self serve page turns the policy's promises into buttons, which is both kinder to users and less work for a solo operator than answering email. Moviz sets no tracking cookies, so it needs no consent banner and gains nothing from a consent platform (Option 3).

The password as the fresh sign in check is enough proof of identity for a free service, and it is already enforced server side by the `/delete-user` hook, so the form cannot skip it. A typed confirmation word would add a step without adding safety beyond what the password gives.

Placeholders with a production build check (the engineer's pick) keep the real details in one file the engineer controls, while making it impossible to deploy production with blanks. The check is narrow on purpose (only real Vercel production builds), so local work, CI and previews keep running while the details are still unknown.

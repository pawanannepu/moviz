# 0013. Where to watch: TMDB watch providers on the movie page, cached a day, for the user's country

**Date**: 2026-11-12
**Status**: In Progress

## Summary

The movie page gets a "Where to watch" section listing the streaming, free, rent and buy services that carry the movie in your country. The data comes from TMDB's watch providers endpoint (which TMDB gets from JustWatch), is fetched when a page needs it, and is kept for 24 hours in one new table so most page views make no outside call. Your country comes from the IP country Vercel already sends, and you can change it right in the section. Feed cards do not show services in this build; that moved to Deferred so the feed stays fast.

## Requirements

Seeded from scope feature 16 ("Where to watch"). Its done line: a movie shows the services that carry it for the user's country, or a clear "not found on streaming" state, and the data source is credited as required. The engineer narrowed it to the movie page only; feed cards are deferred. Spec 0002 fixes `profiles.country` and `country_source`, and that an IP country never overwrites a country the user chose (its AC-17), and leaves the availability table to this spec.

**User stories**:
- As a film fan, I want to see where I can watch a movie in my country so that I can start it tonight.
- As a film fan who travels or uses a VPN, I want to set my country myself so that the list matches the services I actually have.
- As a keyboard or screen reader user, I want the services as readable text, not only logos, so that I can tell them apart.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: The movie page at `/movie/[id]` shows a section with the heading "Where to watch" (an `h2`) after the synopsis and before the director line. It loads behind its own Suspense boundary with a skeleton, so the rest of the page never waits for it. `MovieDetailView` (also used by `/design`) gains an `afterOverview?: ReactNode` slot for it, and its heading levels follow `headingLevel` (h2 and h3 on the movie page, h4 and h5 on `/design`).
- **AC-2**: The section lists the offers for the user's country in up to four groups, in this order and with these labels: "Stream" (TMDB `flatrate`), "Free" (TMDB `free` and `ads` together, with a service that is in both kept once, as its `free` entry), "Rent", "Buy". A group with no offers is left out. Inside a group, services are ordered by TMDB `display_priority`, then name, at most `MAX_PROVIDERS_PER_GROUP` (8). Each service shows its logo (TMDB image `w92`, hotlinked, with an empty `alt` because the name is next to it) and its name as text. Services are not links.
- **AC-3**: When TMDB has no offers for the user's country, the section reads "Not found on streaming in {country name}." When it has offers and TMDB returned a `link`, the section ends with a link "See all options on TMDB" to that TMDB watch page, opening in the same tab; with no `link` the line is left out.
- **AC-4**: Every state of the section that shows TMDB data, including the empty state, shows the credit "Streaming data from JustWatch" with the JustWatch name linked to `https://www.justwatch.com`. The site wide TMDB footer stays as it is.
- **AC-5**: The user's country is, in order: the profile's `country` when it is set and in `WATCH_REGIONS`; else the `x-vercel-ip-country` request header, upper cased, when it is in `WATCH_REGIONS` (codes like `XX` or `T1` are ignored); else none. The header is saved to the profile with source `ip` only when the profile has no country yet, so a page view never rewrites it. Resolving and saving happen inside the Suspense boundary, not before the page's first byte. With no country, the section shows "Choose your country to see where to watch." and the country picker, and no offers.
- **AC-6**: Under the heading, a line reads "In {country name}" followed by a "Change country" button. Pressing it reveals a labelled native select ("Country") listing every code in `WATCH_REGIONS`, each named in English with `Intl.DisplayNames`, sorted by name, and a "Save" button. Saving calls `setCountryAction`, which stores the country with source `user`; the section then shows that country's offers (through `router.refresh()`), and once the refresh settles focus moves to the "In {country name}" line. `WhereToWatch` renders that line with a fixed id, and `CountryPicker` takes a `focusTargetId` prop so the account page (spec 0014) can pass its own heading id instead. Escape or a "Cancel" button closes the picker and returns focus to "Change country".
- **AC-7**: Offers are read from `watch_availability`. A row younger than `WATCH_TTL_HOURS` (24) is used as is, with no TMDB call. A missing or older row triggers one TMDB call (`/movie/{tmdbId}/watch/providers`) as a single attempt with a timeout of `WATCH_FETCH_TIMEOUT_MS` (4 seconds). Today the TMDB client uses a fixed 10 second per try timeout and up to 3 tries, so `RequestOptions` gains `timeoutMs` and `maxAttempts` (defaults unchanged for the catalog sync). On success the row is written for every country TMDB returned and then shown. A TMDB 404 (`tmdb_not_found`) writes a row with `regions: {}`, so the movie shows the empty state for a day without calling again. The page reads only `regions -> $country` and `fetched_at`, not every country.
- **AC-8**: When the TMDB call fails (no token, timeout, error, wrong shape) and a row younger than `WATCH_STALE_MAX_DAYS` (7) exists, that row is shown with no warning. With no usable row, the section shows "Could not load streaming services right now." with no offers and no credit. The rest of the page is unaffected in every case, and nothing is thrown.
- **AC-9**: A movie with no TMDB id in `movie_external_ids` shows the empty state from AC-3 without a TMDB call.
- **AC-10**: One Server Action, `setCountryAction({ country })`, reads the user from the live session, validates with Zod that `country` is one of `WATCH_REGIONS`, calls `upsertProfile` with source `user`, and returns a typed result: `{ ok: true, value: { country } }`, or `unauthenticated`, `invalid_input` or `db_unavailable`. A failure shows "Could not save your country. Try again." beside the Save button, with focus left on Save; `unauthenticated` shows "Your session ended." with a "Sign in again" link.
- **AC-11**: One migration adds `watch_availability`. It holds catalog data, not user data, so it is not in the export; it is removed with its movie by cascade. No log line or error body holds a country, a movie id or a title together with a user id.
- **AC-12**: The section passes axe, each group is a labelled list (`h3` per group), logos never carry information the text does not, and it works at 320px wide with no sideways scroll.

## Decision

**Chosen option**: Option 2: fetch TMDB watch providers on demand from the movie page, keep one row per movie with every country for 24 hours, and read the country from the profile with the IP header as the default.

Only movies people actually open are ever fetched, the outside call happens at most once a day per movie, and a TMDB outage leaves yesterday's answer on screen.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.claude/skills/nextjs-app-router-patterns/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.claude/skills/drizzle-orm-patterns/`) · `tailwindcss` (`hairyf/skills`, `.claude/skills/tailwindcss/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.claude/skills/playwright-best-practices/`)

**Calls made in design** (settled here so the build does not guess):

| Topic | Pick | Why | Runner up |
|---|---|---|---|
| Data source | TMDB `/movie/{id}/watch/providers` | Already the catalog provider, same token, free; the data is JustWatch's | A JustWatch partner API (paid, separate terms) |
| Table shape | One row per movie, all countries in a `jsonb` column, parsed with Zod on read | TMDB returns every country in one call, so one write keeps them consistent | One row per movie and country |
| Stored fields | Only `link` and, per offer type, `providerId`, `name`, `logoPath`, `priority` | Keeps rows small and the shape ours | The raw TMDB body |
| Freshness | 24 hours fresh, 7 days usable on failure | Availability changes often but not hourly; a week old answer beats none | A daily cron for all movies |
| Country list | A checked in `WATCH_REGIONS` constant: the builder fetches TMDB's `/watch/providers/regions` once during the build and commits the codes | No extra call on every page; changes rarely | Fetch `/watch/providers/regions` each time |
| Failures with no usable row | Retried on the next view, one 4 second attempt each time | Rare; a 404 already gets a cached empty row | A short negative cache for errors |
| Saving the IP country | On the movie page read, through `upsertProfile` with source `ip` | Spec 0002's rule already protects a user choice; the movie page is the only reader | At sign up |
| Feature home | New `src/watch/` (client, cache read and write, action, section) | Folder by feature | Inside `src/movie/` |
| After saving a country | `router.refresh()` on the movie page | The page is cheap to render again (no recommender reshuffle like the feed) | Local state only |
| Concurrency | Two page loads may both fetch; the upsert keeps the later write | Harmless duplicates; a lock costs more than the extra call | An advisory lock per movie |

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

| Column | Type | Rule |
|---|---|---|
| `movie_id` | bigint, not null | primary key; foreign key to `movies.id`, `ON DELETE CASCADE` |
| `regions` | jsonb, not null | `{ [countryCode]: { link: string \| null, offers: { type: "flatrate" \| "free" \| "ads" \| "rent" \| "buy", providerId: number, name: string, logoPath: string \| null, priority: number }[] } }` |
| `fetched_at` | timestamptz, not null | when TMDB answered |

Defined in `src/db/schema/catalog.ts` (catalog data, not user data). No other index. Migration 6 (file `drizzle/0006_*`, after specs 0011 and 0012). Relationship: a movie has zero or one availability row. `profiles.country` and `country_source` already exist (spec 0002); nothing changes there.

**State transitions** (the section): `loading` → `offers` | `empty` | `no_country` | `unavailable`. The picker: `closed` → `open` → `saving` → `closed` (with the new country) or `open` with an error line.

**API surface**:

| Function or action | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `WhereToWatch` (`src/watch/where-to-watch.tsx`) | async Server Component | `movieId`, `country` (or null) | the section in one of its states | rendered inside the signed in movie page | never throws; failures are states |
| `loadAvailability(deps, { movieId, now })` | server function | `db`, optional `tmdb` client, the clock | `Result<{ regions, fetchedAt }, { code: "unavailable" }>` following AC-7 to AC-9 | n/a | `unavailable` |
| `tmdb.getWatchProviders(tmdbId, { deadline })` | TMDB client method | TMDB id | `Result<TmdbWatchProviders, TmdbError>`, parsed with Zod | token header | the existing `TmdbError` codes |
| `toRegions(body)` | pure | the TMDB body | our `regions` shape, trimmed and sorted | n/a | none |
| `groupOffers(region)` | pure | one region | the four groups in order, capped at 8 each | n/a | none |
| `setCountryAction` (`src/watch/actions.ts`) | Server Action | `country`: one of `WATCH_REGIONS` (req) | `{ ok: true, value: { country } }` | signed in (`getUserForAction()`) | `unauthenticated`, `invalid_input`, `db_unavailable` |
| `CountryPicker` (`src/watch/country-picker.tsx`) | client component | `current` code or null | the disclosure, select, Save and Cancel | n/a | n/a |
| `resolveCountry(db, { userId, ipCountry })` | server function | user id, the header value or null | `Result<string \| null>`; saves an IP country through `upsertProfile` | caller passes session user | `db_unavailable` (the section then behaves as no country) |

The movie page reads the header with `headers()` from `next/headers` and calls `resolveCountry` alongside `loadMoviePage`. `CountryPicker` is also exported for the account page (spec 0014).

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Movie page | user | `requireUser` (existing) |
| Movie page | country | `profiles.country`; else the `x-vercel-ip-country` header, upper cased; else null |
| Section | country name | `new Intl.DisplayNames(["en"], { type: "region" }).of(code)` |
| Section | TMDB id | `movie_external_ids` where `provider = 'tmdb'` |
| Section | fresh or stale | `now - fetched_at` against `WATCH_TTL_HOURS` and `WATCH_STALE_MAX_DAYS` in `src/watch/constants.ts` |
| Section | groups, order, names, logos | `regions[country].offers` through `groupOffers` |
| Section | logo URL | `https://image.tmdb.org/t/p/w92{logoPath}` built by a `providerLogoUrl` helper in `src/catalog/images.ts` |
| Section | "See all options on TMDB" link | `regions[country].link` |
| Section | JustWatch credit | fixed copy and URL in `src/watch/constants.ts` |
| Picker | the list of countries | `WATCH_REGIONS` in `src/watch/regions.ts` |
| `setCountryAction` | user | `getUserForAction()` (live session) |
| `setCountryAction` | country | action input, Zod validated against `WATCH_REGIONS` |

**Key invariants**:
- The section never blocks or breaks the movie page; every failure is a state.
- A user chosen country is never replaced by an IP country (spec 0002).
- TMDB is called at most once per movie per 24 hours in normal use (two parallel first loads are the only exception).
- Shown data is never older than 7 days.
- Wherever TMDB watch data is shown, the JustWatch credit is shown.

**Security model**:
- The section only renders inside the signed in movie page. `setCountryAction` reads the live session and writes only that user's profile.
- Country is personal data (it hints at location). It stays in `profiles` (already in the export and deleted with the account). It is not logged with the user id. The TMDB call carries no user data at all, only the TMDB movie id.
- The TMDB token stays in the `Authorization` header (existing client rules).

**Configuration required**: none new. `TMDB_API_TOKEN` is now also read at request time by the movie page; when it is unset the section shows the cached row or the unavailable state. On Vercel the `x-vercel-ip-country` header is set automatically; locally it is absent, so the picker shows.

**Critical test scenarios** (each maps to an acceptance criterion):
- Pure: `toRegions` and `groupOffers` from the TMDB fixture: groups in order, `free` and `ads` merged, sorted by priority then name, capped at 8, empty groups dropped, verifies **AC-2**
- Cache (database, fake TMDB): a fresh row makes no call; a 25 hour old row calls once and is replaced; a failing call with a 3 day old row shows it; with a 9 day old row shows unavailable, verifies **AC-7**, **AC-8**
- No TMDB id (database): the empty state, no call, verifies **AC-9**
- Country (database): a new profile takes the IP header with source `ip`; after the user saves `FR`, a header of `US` does not change it, verifies **AC-5**, **AC-10**
- Action: no session gives `unauthenticated`; an unknown code (`XX`) and a non string give `invalid_input`; `us` is accepted as `US` (trimmed and upper cased before the list check), verifies **AC-10**
- Browser: open a movie with offers; the groups, names, the TMDB link and the JustWatch credit show; change the country with the keyboard only and see the new list with focus on "In France", verifies **AC-1**, **AC-3**, **AC-4**, **AC-6**
- Browser: a movie with no offers shows "Not found on streaming in …" with the credit, verifies **AC-3**, **AC-4**
- Failure (component): the section's unavailable state leaves the rest of the page intact, verifies **AC-8**
- Accessibility: axe on every state at 320px and 1280px, verifies **AC-12**
- Test setup note: the browser test server has no TMDB token, so browser specs seed fresh `watch_availability` rows for their movies; the fetch path is covered by database tests with a fake TMDB client.

## Build plan

Ordered as a Tracer Bullet: task 2 makes one thin thread work end to end (a movie page shows real services for one country), then later tasks thicken one strand at a time. Shared files this touches: `src/catalog/tmdb/client.ts` and `src/catalog/http/request-json.ts` (per call timeout and attempts; spec 0012 adds the `requestJson` options first), `src/movie/movie-detail-view.tsx` (the slot), the movie page, `src/catalog/images.ts`.

1. Migration: `watch_availability` in `src/db/schema/catalog.ts`, generated with `pnpm db:generate`. The TMDB client's `getWatchProviders` with its Zod schema and a fixture. Satisfies **AC-7**, **AC-11**
2. Thin thread: `toRegions`, `groupOffers`, `loadAvailability` (fresh row or fetch and write), and `WhereToWatch` on the movie page behind Suspense, with the groups, names, logos, the TMDB link and the JustWatch credit, using the profile country only. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-7**
3. Country: `resolveCountry` with the IP header, the no country state, `WATCH_REGIONS`, `CountryPicker` and `setCountryAction`, focus and error lines. Satisfies **AC-5**, **AC-6**, **AC-10**
4. Failure strand: the stale row rule, the unavailable state, the no TMDB id path, the skeleton. Satisfies **AC-8**, **AC-9**
5. Accessibility, `design.md` notes for the section, a `/design` page sample for each state, browser specs in `e2e/auth/` with axe; then `/sync` adds `src/watch/AGENTS.md`. Satisfies **AC-11**, **AC-12** (and verification of all)

## Consequences

**Positive**:
- Users see where to watch with one cheap read in the common case, and the outside call is bounded by how many movies people open.
- No new provider, secret or cron work.
- The country rule from spec 0002 finally has its first writer and reader.

**Negative / tradeoffs**:
- The first viewer of a movie each day waits for a TMDB call (up to 4 seconds) inside the section's skeleton.
- Feed cards show no services, so a user has to open a movie to see them (deferred by the engineer's choice).
- Services are not deep links; the user goes through TMDB's page to reach a provider, because TMDB does not give direct links.
- `WATCH_REGIONS` can drift from TMDB's real list; a country TMDB adds later is not offered until the constant is updated.
- IP country is wrong for VPN users and travellers until they change it.

**Neutral**:
- One additive migration on the catalog side.
- The TMDB client gains one method; the catalog sync does not change.
- The account page (spec 0014) reuses `CountryPicker`.

## Follow-up

- [ ] Feed cards with service logos, if wanted later (needs availability stored ahead of time for feed movies). Moved to the scope's Deferred list.
- [ ] A small script to refresh `WATCH_REGIONS` from TMDB's `/watch/providers/regions`.
- [ ] Confirm the exact JustWatch credit wording TMDB asks for when the build lands, and adjust the constant if it changed.
- [ ] After the build, `/sync` should add `src/watch/AGENTS.md`.

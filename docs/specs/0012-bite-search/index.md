# 0012. Bite search: a short phrase, embedded with Voyage, blended with your taste, with word rules for hard limits

**Date**: 2026-11-12
**Status**: Accepted

## Summary

You type a short phrase like "something short and funny tonight" on a new `/search` page and get up to 8 movies you have not dealt with yet, each with a reason. The phrase is turned into a vector (a list of numbers that captures meaning) by Voyage, the same service that already embeds the catalog, and movies close to it rank first, nudged toward the movies you liked. A small built in list of word rules turns hard limits like "short", "under 2 hours" or "80s" into real filters, because a vector alone does not reliably honor them. When Voyage fails, the same search runs as plain word matching, so a search never just breaks.

## Requirements

Seeded from scope feature 15 ("Bite search"). Its done line: a short phrase returns a small set of relevant movies the user has not rated, each with a reason; empty, slow, and failed searches are handled. Spec 0002 fixes the `search_usage` table, the 30 searches per UTC day cap (its AC-11), `consumeSearchQuota`, the full text query form over `movies.search` (its AC-8), and that a search is charged before the provider call and never refunded.

**User stories**:
- As a film fan, I want to type a mood or a vibe and get a few picks so that I can choose something for tonight without scrolling the whole feed.
- As a film fan, I want the picks to respect plain limits I typed ("short", "from the 90s") so that I am not shown a three hour epic when I asked for short.
- As a film fan, I want each pick to say why it fits so that I can trust it, like the feed.
- As a keyboard or screen reader user, I want the search to be a normal labelled form with announced results so that I can use it without a pointer.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: A signed in, onboarded user can open `/search`. It shows the heading "Search by mood", one labelled text field ("Describe what you feel like watching"), a "Find picks" submit button, and three example phrases as buttons that fill the field without submitting: "something short and funny tonight", "a slow moody thriller from the 90s", "a feel good classic for a rainy Sunday". A signed out visitor goes to sign in (the route guard), and a user who has not finished onboarding goes to `/onboarding`, the same gate as `/home`. `FeedHeader` (the header every signed in page uses) gains a "Search by mood" link, and `/search` renders `FeedHeader`. The signed out `SiteHeader` does not change.
- **AC-2**: The phrase is trimmed, runs of whitespace inside it collapse to one space, and it must be 2 to 120 characters. A shorter or longer phrase is refused before any quota is spent, with the field error "Type at least 2 characters." or "Keep it under 120 characters.", and focus moves to the field.
- **AC-3**: A valid search spends one unit of the user's daily quota (`consumeSearchQuota`, spec 0002) before Voyage is called. The 31st search on one UTC day is refused with "You have used today's 30 searches. More after {time}." where `{time}` is the next UTC midnight shown in the user's local time, and nothing else runs. A charged search is never refunded, even when it fails later.
- **AC-4**: The word rules (`parsePhrase`) turn these words into filters, matched case insensitive on whole words: "short" or "quick" means at most `SHORT_MAX_MINUTES` (100) minutes; "under N minutes" or "under N mins" means at most N minutes; "under N hours" or "under N hour" means at most N times 60 minutes, rounded down (N is digits only, a whole number or a decimal such as 1.5; written numbers like "two" are not rules); "long" or "epic" means at least `LONG_MIN_MINUTES` (150) minutes; a decade means release years in that decade, written as four digits ("1980s", from 1920s to 2020s), as two digits ("80s", "'80s", where 30s to 90s mean 19xx and 00s, 10s, 20s mean 20xx), or as a word ("eighties", for the thirties to the nineties only); "old" or "classic" means released before `OLD_BEFORE_YEAR` (1980); "new" or "recent" means released in the current UTC year or the `RECENT_YEARS` (3) years before it. Two maximum runtime rules ("short" and "under 90 minutes") keep the smaller maximum. A maximum and a minimum runtime rule together (short and long) drop both. More than one year rule drops every year rule (so "80s or 90s" has no year filter). A movie with no runtime is left out when a runtime filter is on; a movie with no release year is left out when a year filter is on. These words also match inside titles people type ("The Old Guard"); that is accepted, and AC-5 shows the effect.
- **AC-5**: When filters were found, the results area shows a line "Looking for: under 100 minutes, from the 1980s" (each filter in plain words, in the order runtime, then years), so the user can see what the words did. The wording: a maximum runtime is "under N minutes" (hours converted, so "under 2 hours" shows "under 120 minutes", and "short" shows "under 100 minutes"); a minimum is "at least 150 minutes"; a decade is "from the 1980s"; old is "before 1980"; recent is "from {year} on". With no filters the line is absent.
- **AC-6**: The search returns at most `BITE_RESULTS` (8) movies. Every result is listable (`isListable`), has an embedding for `EMBEDDING_MODEL` (vibe mode only), passes every filter, and passes the shared exclusion filter `unavailableMovies(userId, column, "feed")`, so it is not rated, not skipped and not hidden by feedback.
- **AC-7**: In vibe mode the phrase is embedded with Voyage as a `query` input (not `document`) at 1024 dimensions. Each candidate's score is its cosine similarity to the phrase vector plus `BITE_TASTE_WEIGHT` (0.25) times its best weighted similarity (`weight * cosine`) to the user's positive anchors: `[...taste.liked, ...taste.moreLikeThis]` from `loadTaste` (spec 0007, plus the feedback anchors of spec 0011, which is built first). A pair where the anchor is the candidate itself is skipped, as in spec 0011. Disliked anchors play no part in bite search. A user with no positive anchors is ranked by the phrase alone. Ties go to the higher vote count, then the lower movie id.
- **AC-8**: Every result carries a reason, worded by `biteReasonSentence`: in vibe mode, "Fits “{phrase}”, close to Heat (1995)" when the result has a best anchor (the positive anchor with the highest `weight * cosine`, ties to the lower movie id) whose raw cosine is at least `BITE_ANCHOR_MIN_SIMILARITY` (0.5), else "Fits “{phrase}”"; in words mode (AC-9), "Matches your words “{phrase}”". A phrase longer than 40 characters is cut to 40 with "…". No year and no parentheses when the year is null, no full stop.
- **AC-9**: When Voyage is not configured, fails, times out, or returns a wrong shape, the search runs in words mode against `movies.search`, with the same filters and exclusions, ranked by `ts_rank` and then vote count, at most 8. The query is built from the phrase with the words `parsePhrase` used for filters removed, then turned into an OR of its terms (`replace(websearch_to_tsquery('english', $p)::text, '&', '|')::tsquery`), because the default AND would match almost nothing for a mood phrase. If no terms are left (only stop words or filter words), words mode returns no results and the AC-12 empty state shows. The results show the line "Simple search this time: these match your words, not the mood." No error is shown for the fallback itself.
- **AC-10**: The whole search has a time budget of `SEARCH_TIME_BUDGET_MS` (8 seconds). The Voyage call gets at most `VOYAGE_QUERY_TIMEOUT_MS` (5 seconds) of it, as one attempt with no retry, then words mode runs. Today `requestJson` uses a fixed per try timeout and up to 3 tries, so it gains `timeoutMs` and `maxAttempts` options (defaults unchanged for the catalog), and `runBiteSearch` also races the call against the 5 second limit. The budget bounds the Voyage step; the database reads after it are not cut short. While a search is pending, the button reads "Searching…" and is `aria-disabled`, a second submit does nothing, and the field keeps its text.
- **AC-11**: Results show as the same feed cards (`FeedItem`) with their reason bar, in a grid under the heading "Picks for “{phrase}”". Each card opens `/movie/[id]`. Search cards carry no feedback buttons from spec 0011 (search is its own surface, and Undo there depends on the feed store). When results arrive, focus moves to that heading and the page's live region announces "8 picks for {phrase}" (the real count, "1 pick for {phrase}" for one).
- **AC-12**: No results gives the empty state "Nothing fits “{phrase}”. Try fewer or different words." with the filter line from AC-5 if any, focus on the empty state heading, and an announcement. A database failure gives "Search is not working right now. Try again." with the field kept and focus on the message. An `unauthenticated` result shows "Your session ended." with a "Sign in again" link to `/sign-in?returnTo=/search`, focus on the link.
- **AC-13**: The last search's phrase and results are kept in client memory for the visit, so going Back from a movie page to `/search` shows them again without a new search and without spending quota. Reloading the page shows the empty form. The store's provider sits in `src/app/(protected)/layout.tsx` next to the feed store, and the kept result is keyed by user id like `FeedStore.read(userId, ...)`, so another user on the same tab never sees it. Opening a search card does not touch the feed store. The movie page's "Back to picks" still goes to `/home`; the browser's Back returns to `/search`.
- **AC-14**: One Server Action, `biteSearchAction({ phrase })`, reads the user from the live session, validates with Zod, and returns a typed result: `{ ok: true, value: { mode, filters, picks } }`, or `unauthenticated`, `invalid_input`, `quota_exceeded` (with `resetsAt`), `not_onboarded` or `db_unavailable`. It checks in this order: session, then Zod, then onboarding, then quota. On `not_onboarded` the client goes to `/onboarding`.
- **AC-15**: The phrase is never stored, never logged and never sent anywhere but Voyage. No log line, thrown message, error body or analytics event holds the phrase, a movie id, a title or a score. Migration 5 adds `search_usage` (spec 0002); the export gains `searchUsage` (`day`, `count`), deletion removes the rows by cascade, and the completeness test covers the table.
- **AC-16**: The daily cron (`/api/cron/catalog`) runs `purgeOldRows` right after its bearer check and before its config check (which returns `config_missing` early today), so the purge runs even when catalog config is missing. It deletes `search_usage` rows older than `SEARCH_USAGE_KEEP_DAYS` (30) days; Better Auth `rate_limit` rows whose `last_request` (epoch milliseconds) is older than `RATE_LIMIT_KEEP_DAYS` (1) day; and `session` and `verification` rows whose `expires_at` is more than one day past, because Better Auth does not purge them. The constants are exported from `src/user-data/purge-old-rows.ts` (spec 0014's policy reads them). A purge failure is logged with its code and never stops the catalog job. The JSON body and log line gain `purged: { searchUsage, rateLimit, session, verification }`, counts only.

## Decision

**Chosen option**: Option 2: Voyage query embedding blended with the taste anchors, plus a small pure word rule parser for hard limits, with full text search as the fallback.

The only new moving part is one more call shape to a service the project already pays for and already handles failures from. Everything else (anchors, exclusions, quota, the card) is reused.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.claude/skills/nextjs-app-router-patterns/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.claude/skills/drizzle-orm-patterns/`) · `neon-postgres` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.claude/skills/playwright-best-practices/`)

**Calls made in design** (settled here so the build does not guess):

| Topic | Pick | Why | Runner up |
|---|---|---|---|
| Query parsing | Pure `parsePhrase` with a fixed word list | Free, testable, honest about what it understood (AC-5) | An LLM call (engineer chose not to) |
| Words removed before embedding | No, the whole phrase is embedded | "short and funny" still carries mood; removing words risks an empty phrase | Strip matched words |
| Feature home | New `src/search/` | Folder by feature | Inside `src/recommend/` |
| Page state | Server Action, results in client memory (AC-13), not in the URL | A `?q=` URL would spend quota on every reload and leak the phrase into history and logs | `/search?q=` as a GET |
| Taste blend | Additive, weight 0.25, one SQL query reusing the anchors from `loadTaste` | The phrase must lead; taste only breaks near ties | Rerank the recommender's 300 candidates |
| Results count | 8 | "A few picks" from the scope; fits two rows on desktop | 12 |
| Vector scan | Exact, like the recommender | Spec 0002 and `src/recommend/AGENTS.md`: the HNSW index can drop rows after filters | HNSW with iterative scan |
| Purge home | `src/user-data/purge-old-rows.ts`, called right after the cron's bearer check | Spec 0002 asked spec 15 to wire it; the cron already exists | A second cron route |
| Rate limit | Only the daily quota | The quota already bounds cost per user | A per minute limit as well |

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (the table spec 0002 designed, made concrete):

| Column | Type | Rule |
|---|---|---|
| `user_id` | text, not null | primary key part; foreign key to `user.id`, `ON DELETE CASCADE` |
| `day` | date, not null | primary key part; the UTC day, from `(now() at time zone 'utc')::date` in SQL |
| `count` | integer, not null, default 0 | never above 30, enforced in the upsert's `WHERE` |

Primary key (`user_id`, `day`). No other index. Uses the `userId()` helper in `src/db/schema/user-data.ts`. Migration 5 in spec 0002's slice coverage (file `drizzle/0005_*`, after spec 0011's `0004_*`). No table stores phrases or results.

**State transitions** (the page, client side): `idle` → `pending` → `results` | `empty` | `error` | `quota` | `session_ended`; any state → `pending` on a new submit. `results` and `empty` are kept in memory for Back (AC-13).

**API surface**:

| Function or action | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `biteSearchAction` (`src/search/actions.ts`) | Server Action | `phrase`: string (req) | `{ ok: true, value: { mode: "vibe" \| "words", filters: PhraseFilters, picks: BitePick[] } }` | signed in (`getUserForAction()`), onboarded | `unauthenticated`, `invalid_input` (`too_short` \| `too_long`), `not_onboarded`, `quota_exceeded` (`resetsAt`: ISO string), `db_unavailable` |
| `runBiteSearch(deps, { userId, phrase, now })` | server function | `db`, optional `voyage`, the clock | `Result<BiteSearchResult, BiteSearchError>`; quota, parse, embed or fall back, score, load cards | caller passes session user | `quota_exceeded`, `db_unavailable` |
| `parsePhrase(phrase, { currentYear })` | pure | phrase, the current UTC year | `PhraseFilters`: `{ runtimeMax?, runtimeMin?, yearFrom?, yearTo?, labels: string[] }` | n/a | none |
| `consumeSearchQuota(db, { userId })` | data function | user id | `Result<{ remaining }>` (spec 0002) | caller passes session user | `quota_exceeded` (`resetsAt`) |
| `voyage.embedQuery(text, { deadline })` | Voyage client method | one text | `Result<number[] \| null, VoyageError>`; `input_type: "query"`, `output_dimension: 1024` | n/a | the existing `VoyageError` codes |
| `scoreBite(executor, { userId, vector, filters, anchors })` | SQL read | the query vector, filters, positive anchors (`liked` plus `moreLikeThis`) from `loadTaste` | at most 8 `{ movieId, bestAnchorId, bestAnchorSimilarity }`, where the best anchor is chosen by `weight * cosine` and `bestAnchorSimilarity` is its raw cosine | n/a | errors rise |
| `wordsBite(executor, { userId, phrase, filters })` | SQL read | phrase, filters | at most 8 movie ids | n/a | errors rise |
| `biteReasonSentence(reason)` | pure | `BiteReason` | the AC-8 sentence | n/a | none |
| `purgeOldRows(db, { now })` (`src/user-data/`) | data function | the clock | `Result<{ searchUsage, rateLimit }>` counts | cron bearer secret (existing) | `db_unavailable` |
| `/search` page | Server Component | none | the header, heading and the client `BiteSearch` form | route guard plus `requireUser`, onboarding gate | redirects |

`BitePick` is `{ movie: MovieCardMovie, reason: BiteReason }`, where `BiteReason` is `{ kind: "bite_vibe", phrase, anchor: { movieId, title, releaseYear } | null } | { kind: "bite_words", phrase }`. It does not join the recommender's `Reason` union, so the feed's types do not change. Cards are loaded with the existing `loadPickCards`.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `biteSearchAction` | the user | `getUserForAction()` (live session), never the client |
| `biteSearchAction` | onboarded or not | `getProfile(...).onboardedAt` |
| `biteSearchAction` | phrase | action input, trimmed, Zod validated |
| Quota | `day` and `resetsAt` | SQL `(now() at time zone 'utc')::date`, and the next UTC midnight from it (spec 0002) |
| Quota message | `{time}` in local time | `resetsAt` formatted in the browser with `Intl.DateTimeFormat` (time only) |
| Filters | runtime and year bounds, labels | `parsePhrase` with the constants in `src/search/rules.ts` |
| Filters | current year | the server clock, UTC, passed into `parsePhrase` |
| Vibe mode | phrase vector | Voyage `embedQuery` |
| Vibe mode | liked anchors and weights | `loadTaste` (spec 0007), same transaction |
| Score | similarity and taste blend | SQL: `1 - (embedding <=> $vector)` plus `BITE_TASTE_WEIGHT` times the max of `weight * (1 - (anchor <=> embedding))` over liked anchors |
| Reason | anchor named or not | `bestAnchorSimilarity >= BITE_ANCHOR_MIN_SIMILARITY` from `scoreBite`, title and year from `loadTaste` |
| Words mode | ranked ids | `ts_rank(movies.search, websearch_to_tsquery('english', $phrase))`, then `vote_count desc nulls last`, then `id` |
| Cards | movie fields | `loadPickCards` (spec 0007) |
| "Simple search" line | shown or not | `mode === "words"` in the result |
| Kept results | phrase and picks | client memory store in `src/search/search-store.tsx`, written on every successful result |
| Export | `searchUsage` | `search_usage` rows for the user |

**Key invariants**:
- A search never shows a movie the user rated, skipped or hid, and never an unlisted one.
- A charged search is never refunded; a refused search charges nothing.
- `search_usage.count` never exceeds 30 per user per UTC day (spec 0002).
- The phrase leaves the server only to Voyage, and is never written anywhere.
- Every tuning number lives in `src/search/rules.ts` (word rule numbers) or `src/search/weights.ts` (scoring numbers), pinned by a test.
- All reads of one search run in one read only transaction, after the quota statement commits.

**Security model**:
- Signed in, onboarded users only. The action reads the live session; the user id never comes from the client.
- A user can only spend and read their own quota. The phrase is personal taste data in transit, so it follows the ratings rule: never logged, never in analytics.
- Voyage receives the phrase with no user id. The privacy policy (spec 0014) lists Voyage as a processor for this.
- Expected failures are typed. Unexpected database errors go through `unexpectedDbError`, which keeps only the error kind and SQLSTATE (Drizzle puts parameters, including the phrase, in its messages).

**Configuration required**: none new. `VOYAGE_API_KEY` already exists; when it is unset, every search runs in words mode (AC-9).

**Critical test scenarios** (each maps to an acceptance criterion):
- Pure: `parsePhrase` for each word rule, the contradictions, whole word matching ("shortcake" is not "short"), and decades at both ends, verifies **AC-4**
- Pure: `biteReasonSentence` for both kinds, with and without an anchor and a year, and a 60 character phrase, verifies **AC-8**
- Happy path (database, fake Voyage): a vector close to movie A ranks A first; a liked anchor near B lifts B above an equal candidate; a rated, skipped and hidden movie never appear, verifies **AC-6**, **AC-7**
- Filters (database): "short" leaves out a 140 minute movie and a movie with no runtime; "80s" keeps only 1980 to 1989, verifies **AC-4**, **AC-6**
- Fallback (database): Voyage returns `voyage_unavailable`; the result is `mode: "words"` with title matches first; with no key the same, verifies **AC-9**
- Quota (database): 30 searches succeed, the 31st returns `quota_exceeded` with the next UTC midnight and does not call Voyage; a failed search still counts, verifies **AC-3**
- Validation (action): a 1 character and a 121 character phrase return `invalid_input` and spend nothing; no session returns `unauthenticated`, verifies **AC-2**, **AC-14**
- Browser: search, see 8 cards with reasons and focus on the results heading, open one, go Back, see the same results with no new quota row change, verifies **AC-11**, **AC-13**
- Browser: the empty state and the database error state, each with focus and announcement, verifies **AC-12**
- Timing (unit): a Voyage fake that never answers falls back within the budget, and the button is `aria-disabled` while pending, verifies **AC-10**
- Privacy: a test spies on `console` during a failing search and finds no phrase, title or id; export holds `searchUsage`; the completeness test passes, verifies **AC-15**
- Cron (database): rows 31 days old and expired `rate_limit` rows are deleted, newer ones kept, counts reported, verifies **AC-16**
- Accessibility: axe passes on the form, results, empty and error states, verifies **AC-1**, **AC-11**, **AC-12**
- Test setup note: the browser test server has no Voyage key, so browser specs see words mode and assert its reason; vibe mode is covered by database tests with an injected fake `voyage` client.

## Build plan

Ordered as a Tracer Bullet: task 2 makes one thin thread work end to end (type a phrase, see picks), then later tasks thicken one strand at a time. Shared files this touches: `src/catalog/http/request-json.ts` and `src/catalog/embedding/voyage-client.ts` (new options and method), `src/feed/feed-header.tsx` (the link), `src/app/(protected)/layout.tsx` (the store provider), `src/catalog/cron/handle-cron.ts` (the purge).

1. Migration 5: `search_usage` in `src/db/schema/user-data.ts`, generated with `pnpm db:generate`; `consumeSearchQuota`; `searchUsage` in `exportUserData`, `user-tables.ts` and the completeness test. Satisfies **AC-3**, **AC-15**
2. Thin thread: `voyage.embedQuery`; `scoreBite` with exclusions and listable rule but no taste blend yet; `runBiteSearch` and `biteSearchAction`; the `/search` page with its gates, the form, and plain result cards with "Fits “…”" reasons; the "Search by mood" links. Satisfies **AC-1**, **AC-2**, **AC-6**, **AC-11**, **AC-14**
3. Word rules: `parsePhrase` and its constants, filters applied in `scoreBite`, the "Looking for" line. Satisfies **AC-4**, **AC-5**
4. Taste blend and reasons: anchors from `loadTaste` in the same transaction, the blended score, `BiteReason` with the anchor rule, `biteReasonSentence`, the weights file and its test. Satisfies **AC-7**, **AC-8**
5. Failure strand: words mode (`wordsBite`), the time budget, the pending state, the quota message, the empty, error and session ended states with focus and announcements. Satisfies **AC-3**, **AC-9**, **AC-10**, **AC-12**
6. Kept results: the client memory store so Back restores the last search. Satisfies **AC-13**
7. Purge: `purgeOldRows` in `src/user-data/` (search usage, rate limit, expired session and verification rows) with its exported keep constants, called after the bearer check in the cron handler, with counts in the body and the run log. Satisfies **AC-16**
8. Privacy and browser pass: the no logging check, browser specs in `e2e/auth/` with axe scans, the `/design` page sample for a bite card; then `/sync` adds `src/search/AGENTS.md`. Satisfies **AC-1** to **AC-16** (verification)

## Consequences

**Positive**:
- A real mood search with no new provider, no new secret and almost no extra cost (one short Voyage query per search, capped at 30 a day per user).
- The word rules are honest: the "Looking for" line tells the user what was understood.
- The fallback means a Voyage outage degrades the feature instead of breaking it.
- Every pick still says why, in line with the product promise.

**Negative / tradeoffs**:
- The word list understands only the words it lists. "Something under two hours" (a word, not a digit) or "not too long" are not filters; they only shape the vibe vector. Growing the list is a code change.
- Genres and moods ("funny", "dark") are left to the vector, so a "funny" search can still surface a drama that reads as light.
- Words mode is much weaker than vibe mode; a Voyage outage makes search feel worse, though it still works.
- Arriving at a movie page from search shows the feed style reason (or none), not the search reason, because the movie page reads `reasonFor`.
- The exact scan is about as slow as the recommender's (hundreds of milliseconds in Postgres), plus the Voyage round trip.
- A failed search still costs one of the 30 daily searches, by spec 0002's rule.

**Neutral**:
- One additive migration, as spec 0002 planned (migration 5).
- The Voyage client gains one method; the catalog embedding path does not change.
- The daily cron gains a short purge step before the catalog work, inside the same 45 second budget.

## Follow-up

- [ ] Grow the word list from real phrases, if users ask (written numbers, "not too long", genre words as soft boosts).
- [ ] If search latency is a problem, consider the HNSW index with iterative scan (spec 0002) for both search and the recommender together.
- [ ] Consider passing the search reason to the movie page (for example through the kept results) so the page can show "Fits “…”".
- [ ] After the build, `/sync` should add `src/search/AGENTS.md` and note the purge step in `src/catalog/AGENTS.md`.

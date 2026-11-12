# 0011. Feed feedback: "Not interested" hides a pick, "More like this" adds it as a taste anchor

**Date**: 2026-11-11
**Status**: Accepted

## Summary

Every feed card and each eligible movie page gets two labelled buttons: "More like this" and "Not interested". "Not interested" keeps the movie out of later picks, with an inline Undo. "More like this" turns the movie into an extra liked anchor (a reference movie the recommender measures closeness to), so the next Load more batch and the next visit lean toward it, with the reason "More like Heat (1995), as you asked". Each tap is one row in the `feed_feedback` table that spec 0002 already designed. Nothing reshuffles under your finger: a dismissed card leaves right away, and "more like this" shapes what comes next.

## Requirements

Seeded from scope feature 14 ("Feed feedback"). Its done line: a user can dismiss a pick or ask for more like it, dismissed movies stay gone, and the next feed visibly reflects the feedback. Spec 0002 fixes the table, the one row per user and movie rule (its AC-6), and that the shared exclusion filter hides `not_interested` movies on both the deck and the feed (its AC-5).

**User stories**:
- As a film fan, I want to tell the feed "not interested" on a pick so that it stops showing me that movie.
- As a film fan, I want to ask for more like a pick so that my next picks lean toward it, and I can see that they did.
- As a film fan, I want to take back a tap I did not mean so that one stray press does not cost me a movie.
- As a keyboard or screen reader user, I want both controls to be real labelled buttons so that I can give feedback without a pointer.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: Every feed card shows two labelled text buttons under its meta line: "More like this" (a toggle with `aria-pressed`) and "Not interested". Each is its own focusable button with the global focus ring, at least 44px high, and sits above the card's stretched link, so pressing a button never opens the movie page and pressing the rest of the card still does. Each button's accessible name includes the movie title (for example "Not interested in Heat"), so a list of 24 cards does not read as 24 identical buttons.
- **AC-2**: Pressing "Not interested" on a feed card saves `not_interested` for that movie. When the save succeeds, the card is replaced in its grid cell by a line reading "Hidden from your picks." and an "Undo" button, with no animation. Focus moves to Undo, and the feed's live region announces "Heat hidden from your picks".
- **AC-3**: Pressing Undo clears the feedback row. When that succeeds, the card comes back in the same place with its reason and its "More like this" button unpressed, and focus moves to that card's "Not interested" button. Undo has no timer: it stays until the user leaves the page.
- **AC-4**: While a movie is marked `not_interested`, it does not appear for that user in a later Load more batch, a new visit's feed, or the swipe deck. `unavailableMovies(userId, column, surface)` gains a `not_interested` clause for both surfaces, so every reader of that filter (the recommender's candidates, `reasonFor`, the deck) obeys it. A `more_like_this` movie stays visible.
- **AC-5**: Pressing "More like this" saves `more_like_this` and shows the button pressed (`aria-pressed="true"`, a visibly different style that does not rely on colour alone, and the label stays "More like this"). Pressing it again clears the row and unpresses it. Focus stays on the button. The live region announces "More like Heat on your next picks" on set, and "Removed more like Heat" on clear. The movie itself stays in the feed. Picks already on the page do not change.
- **AC-6**: The recommender reads up to `MORE_LIKE_THIS_ANCHORS` (10) feedback anchors: the user's `more_like_this` movies that have an embedding for `EMBEDDING_MODEL` and that the user has not rated, newest `created_at` first, then highest movie id. Each joins the liked anchors with weight `MORE_LIKE_THIS_WEIGHT` (1.0, the same as a rating of 10). Both numbers live in `weights.ts` and are pinned in `weights.test.ts`. The 30 rating anchors are unchanged. With feedback anchors present, the next Load more batch and the next visit rank movies close to them higher than they would without them.
- **AC-7**: An anchor never scores itself. The scoring query skips any pair where the anchor is the candidate, and `reasonFor` skips the page's own movie as an anchor. A `more_like_this` movie can therefore still appear in the feed, ranked only by its closeness to the other anchors.
- **AC-8**: A pick whose best positive anchor is a feedback anchor carries a new reason, `{ kind: "more_like_this", anchor: { movieId, title, releaseYear } }`, worded by `reasonSentence` as "More like Heat (1995), as you asked": no year and no parentheses when the year is null, no full stop. Ties between a rating anchor and a feedback anchor go to the lower movie id, the existing rule. The movie page shows the same sentence the card showed, through `reasonFor`.
- **AC-9**: A user with no liked rating but at least one feedback anchor gets taste picks, not the popular fallback. Taste strength counts liked ratings plus feedback anchors. The variety cap uses the number of positive anchors of both kinds.
- **AC-10**: Rating a movie never touches its feedback row, and the rating wins: a movie the user has rated is never read as a feedback anchor. The rating save paths (`saveRating`, `saveSwipe`, import) do not change.
- **AC-11**: The movie page at `/movie/[id]` shows the same two controls below the reason, when the movie has a reason (the feed could show it) or when the user has marked it `not_interested`. In any other case (rated, skipped, not listable) there are no controls. "Not interested" keeps the user on the page and turns the controls into "Hidden from your picks." and Undo, with focus on Undo. A page loaded for a movie already marked `not_interested` opens in that hidden state, so the movie page is the way back for a dismissed movie. The reason bar already on screen stays until the page is loaded again.
- **AC-12**: Every tap waits for the server. While a save is pending both buttons of that card are `aria-disabled` and a second press does nothing. A failed save changes nothing on screen and shows an inline line "Could not save. Try again." beside the buttons, with focus left on the pressed button. An `unauthenticated` result shows "Your session ended." with a "Sign in again" link (to `/sign-in?returnTo=` the current path), and focus moves to that link.
- **AC-13**: One Server Action, `setFeedbackAction({ movieId, kind })`, where `kind` is `not_interested`, `more_like_this` or `null` (clear). It reads the user from the live session, validates the input with Zod, and returns a typed result: `{ ok: true, value: { kind } }`, or `unauthenticated`, `invalid_input`, `movie_not_found` or `db_unavailable`. It is idempotent: setting the same kind again leaves one row and keeps its `created_at`; setting the other kind replaces the row and resets `created_at`; clearing a movie with no row succeeds.
- **AC-14**: One migration adds the `feedback_kind` enum and the `feed_feedback` table with its index. Account export includes a `feedback` list (`movieId`, `title`, `year`, `kind`, `createdAt`) and the completeness test covers the table. Account deletion removes the user's rows by cascade. No log line, thrown message, error body or analytics event holds a movie id, title or feedback kind.
- **AC-15**: The kept feed (spec 0010) follows feedback given in this visit. A pick hidden on the feed or on the movie page is left out when the feed is restored, with no Hidden line. A pick whose "More like this" changed on the movie page comes back with the new pressed state. An Undo on the movie page puts the pick back in the kept list. The kept list's first batch ids (`seedIds`) do not change, so the restore check from spec 0010 still matches.

## Decision

**Chosen option**: Option 1: feedback as data the recommender already understands. "Not interested" joins the shared exclusion filter, and "More like this" adds capped, strong liked anchors, saved through one Server Action that waits for the server, with an inline Undo.

Feedback is one row per user and movie in `feed_feedback`. Both readers (the exclusion filter and the anchor read) are small additions to code that already exists, so no new scoring pass, no new service, and nothing stored that could go stale.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.claude/skills/nextjs-app-router-patterns/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.claude/skills/drizzle-orm-patterns/`) · `neon-postgres` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres/`) · `tailwindcss` (`hairyf/skills`, `.claude/skills/tailwindcss/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.claude/skills/playwright-best-practices/`)

**Calls made in design** (settled here so the build does not guess):

| Topic | Pick | Why | Runner up |
|---|---|---|---|
| Actions | One `setFeedbackAction` with `kind` or `null` | One input schema, one result type, Undo and toggle are the same call | Separate set and clear actions |
| Feature home | New `src/feedback/` (data functions, action, `FeedbackControls`) | Folder by feature; the feed and the movie page both import it | Put it in `src/feed/` |
| Pressed state on cards | One read per batch: `moreLikeThisIds(db, userId, movieIds)` in `loadFeedBatch` | The recommender stays about ranking; the cap of 10 anchors must not decide which buttons look pressed | Return it from the recommender |
| After a save | No `revalidatePath`, no `router.refresh()` | A refresh reruns the recommender (about 3 seconds) and reshuffles the list, which the timing decision rules out | Refresh the feed |
| Motion | None; the card swaps to the Hidden line instantly | `design.md` allows three motion moments, and feedback is not one of them | A fade out |
| `created_at` on upsert | Kept when the kind is the same, reset when it changes | "10 most recent" should mean most recently asked, and a repeat press is not a new request | Always reset |
| Rate limit | None, like `loadMoreAction` | A signed in, idempotent primary key upsert; no cost to abuse beyond one row per movie | A per user limit (shared follow up) |
| Self anchor | Skip pairs where anchor equals candidate, in scoring and in `reasonFor` | Without it a `more_like_this` movie scores about 1.0 against itself and jumps to the top of every feed | Exclude feedback anchor movies from candidates |

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (the one table spec 0002 designed, made concrete):

| Column | Type | Rule |
|---|---|---|
| `user_id` | text, not null | primary key part; foreign key to `user.id`, `ON DELETE CASCADE` |
| `movie_id` | bigint, not null | primary key part; foreign key to `movies.id`, `ON DELETE RESTRICT` |
| `kind` | `feedback_kind` enum (`not_interested`, `more_like_this`), not null | |
| `created_at` | timestamptz, not null, default `now()` | reset only when `kind` changes |

Primary key (`user_id`, `movie_id`). Index (`user_id`, `kind`, `created_at` desc) for the anchor read. In Drizzle it uses the existing `userId()` and `movieId()` helpers in `src/db/schema/user-data.ts`. Relationships: a user has many feedback rows; a movie is pointed at by many. Migration 4 in spec 0002's slice coverage.

**State transitions** (one row per user and movie):

```
none ──set more_like_this──> more_like_this ──set null──> none
none ──set not_interested──> not_interested ──set null (Undo)──> none
more_like_this ──set not_interested──> not_interested   (created_at reset)
not_interested ──set more_like_this──> more_like_this   (created_at reset; reachable only through a direct call, the UI offers Undo instead)
any ──set same kind──> same row, created_at kept
```

A card's client state: `shown` → `pending` → `shown` (pressed or not) or `hidden` (Hidden line with Undo) or `error` (inline message). `hidden` → `pending` → `shown` on a successful Undo.

**API surface**:

| Function or action | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `setFeedbackAction` (`src/feedback/actions.ts`) | Server Action | `movieId`: positive safe integer (req); `kind`: `not_interested` \| `more_like_this` \| `null` (req) | `{ ok: true, value: { kind } }` | signed in, user from `getUserForAction()` | `unauthenticated`, `invalid_input`, `movie_not_found`, `db_unavailable` |
| `setFeedback(db, { userId, movieId, kind })` | data function | user id from the caller's session, movie id, kind | `Result<void>`; one `INSERT ... ON CONFLICT (user_id, movie_id) DO UPDATE SET kind = excluded.kind, created_at = CASE WHEN feed_feedback.kind = excluded.kind THEN feed_feedback.created_at ELSE now() END` | caller passes session user | `movie_not_found` (foreign key violation, SQLSTATE 23503), `db_unavailable` |
| `clearFeedback(db, { userId, movieId })` | data function | user id, movie id | `Result<void>`; one `DELETE`, zero rows is success | caller passes session user | `db_unavailable` |
| `feedbackFor(db, { userId, movieId })` | data function | user id, movie id | `Result<FeedbackKind \| null>` | caller passes session user | `db_unavailable` |
| `moreLikeThisIds(db, { userId, movieIds })` | data function | user id, up to 50 movie ids | `Result<Set<number>>`, one query with `movie_id = ANY(...)` | caller passes session user | `db_unavailable` |
| `unavailableMovies` (`src/user-data/exclusions.ts`) | SQL fragment | unchanged signature | adds `not exists (... feed_feedback where kind = 'not_interested')` for both surfaces | n/a | none |
| `loadTaste` (`src/recommend/load-taste.ts`) | recommender read | unchanged | `Taste` gains `moreLikeThis: TasteAnchor[]` (weight `MORE_LIKE_THIS_WEIGHT`) and `moreLikeThisCount`; `TasteAnchor` gains `source: "rating" \| "more_like_this"` | n/a | none (errors rise to `recommendMovies`) |
| `scoreCandidates` | recommender read | `liked` now holds rating and feedback anchors | unchanged rows; the `pairs` CTE adds `a.movie_id <> movies.id` | n/a | none |
| `reasonFor` | recommender read | unchanged | may return the new `more_like_this` reason; skips the page's own movie as an anchor | n/a | unchanged |
| `reasonSentence` (`src/feed/reason-sentence.ts`) | pure | `Reason` | adds "More like {title} ({year}), as you asked" | n/a | none |
| `FeedbackControls` (`src/feedback/feedback-controls.tsx`) | client component | `movie` (`id`, `title`), `initial`: `FeedbackKind \| null`, `onChange(kind)` | the two buttons, the Hidden line, the inline error, the live announcement through the caller | n/a | n/a |
| Kept feed store (`src/feed/feed-store.tsx`) | client memory | `recordFeedback(movieId, kind \| null)` | `KeptFeed` gains `hiddenIds: number[]`; `FeedPick` gains `moreLikeThis: boolean` | n/a | n/a |

`FeedPick` becomes `{ movie, reason, moreLikeThis }`; `loadMoreAction`'s result carries it with no other change. On the feed, the dismissed card's grid cell holds the Hidden line, so the list keeps its order and the Load more `shown` ids still include the dismissed movie (harmless: the database excludes it too).

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `setFeedbackAction` | the user | `getUserForAction()` (live session), never the client |
| `setFeedbackAction` | movie id, kind | action input, Zod validated |
| `setFeedbackAction` | `movie_not_found` | foreign key violation from the insert (no separate read) |
| `setFeedback` | `created_at` | `now()` on insert or kind change, else the existing value |
| Feed card | "More like this" pressed on first render | `moreLikeThisIds` for the batch's movie ids, read in `loadFeedBatch` |
| Feed card | button names | `movie.title` from the pick |
| Feed card | Hidden line and Undo | client state after a successful `not_interested` save |
| Feed card | live region text | `movie.title` plus fixed copy in `src/feedback/constants.ts` |
| Movie page | whether controls show, and their first state | `reasonFor` result (non null) or `feedbackFor` result (`not_interested`), both read in `loadMoviePage` |
| Recommender | feedback anchors and their order | `feed_feedback` rows where `kind = 'more_like_this'`, joined to `movie_embeddings` for `EMBEDDING_MODEL`, not in `ratings` for the user, ordered `created_at desc, movie_id desc`, limit `MORE_LIKE_THIS_ANCHORS` |
| Recommender | feedback anchor weight | `MORE_LIKE_THIS_WEIGHT` in `weights.ts` (1.0) |
| Recommender | taste strength | `tasteStrength(likedCount + moreLikeThisCount)` |
| Recommender | variety cap | `varietyCap(limit, liked.length + moreLikeThis.length)` |
| Reason | kind and anchor | the best positive anchor's `source`, title and year from `loadTaste` |
| Reason sentence | "More like Heat (1995), as you asked" | `reasonSentence` |
| Kept feed restore | which picks to drop, which are pressed | `hiddenIds` and each pick's `moreLikeThis` in the store, written by `recordFeedback` on every successful save from the feed or the movie page |
| Sign in again link | return path | the current path (`/home` or `/movie/{id}`) |
| Export | `feedback` entries | `feed_feedback` joined to `movies` for title and year |

**Key invariants**:
- At most one feedback row per user and movie (primary key).
- A `not_interested` movie is never in the user's feed or deck (one shared filter, both surfaces).
- An anchor is never scored against itself.
- A rated movie is never a feedback anchor; the rating decides.
- At most 10 feedback anchors and 30 rating anchors per call, so the scoring query stays bounded.
- The client never sends a user id, and never builds a reason from raw data.
- Every tuning number stays in `weights.ts`.

**Security model**:
- Signed in users only. The route guard in `src/proxy.ts` already closes `/home` and `/movie/[id]`; the action reads the live session and returns `unauthenticated` without it.
- A user reads and writes only their own rows: every query binds the session user id (spec 0002, AC-14). There is no way to name another user.
- Feedback is personal taste data, like ratings: it is in the export and is deleted with the account. No log, error body or analytics event holds a movie id, title or kind. Unexpected errors go through `unexpectedDbError`, which keeps only the error kind and SQLSTATE.
- Scope says no legal regime is named yet; spec 17 decides. Nothing here adds a new class of data.

**Configuration required**: none. No new environment variable, secret or service.

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path (browser): open the feed, press "Not interested" on the first card; the Hidden line shows with focus on Undo; press Load more and reload; the movie is gone both times; the swipe deck never offers it, verifies **AC-2**, **AC-4**
- Happy path (browser): press Undo; the card returns in place and focus is on its "Not interested" button, verifies **AC-3**
- Happy path (database): a user with ratings presses "More like this" on movie M; a new `recommendMovies` call ranks M's nearest neighbours above where they ranked before, at least one pick has reason `more_like_this` naming M, and M is not scored against itself, verifies **AC-6**, **AC-7**, **AC-8**
- Edge (database): a user with no ratings and one feedback anchor gets taste mode, not popular, verifies **AC-9**
- Edge (database): eleven `more_like_this` rows; only the newest ten become anchors; a rated `more_like_this` movie is not one of them, verifies **AC-6**, **AC-10**
- Edge (database): set `more_like_this` twice, then `not_interested`, then clear; one row at each step, `created_at` kept on the repeat and reset on the change, no row at the end, verifies **AC-13**
- Pure: `reasonSentence` words the new kind with and without a year, verifies **AC-8**
- Failure case (component): the action returns `db_unavailable`; the card stays, the inline message shows, focus stays on the pressed button; a second press while pending does nothing, verifies **AC-12**
- Auth/permission (action): no session gives `unauthenticated` and writes nothing; a `movieId` of 0 or text gives `invalid_input`; an unknown id gives `movie_not_found`, verifies **AC-12**, **AC-13**
- Movie page (browser): hide a movie from its page, go back to the feed; the card is not there; reopen the movie page by URL and it opens in the hidden state with Undo, verifies **AC-11**, **AC-15**
- Accessibility (component and browser): axe passes on a card with controls, a hidden card and an error state; button names include the title; the card link still opens the page, verifies **AC-1**
- Data: export holds the `feedback` list; deleting the account removes the rows; the completeness test passes, verifies **AC-14**

## Build plan

Ordered as a Tracer Bullet: the first two tasks make one thin thread work end to end (a tap on a feed card saves a row, and the feed obeys it), then later tasks thicken one strand at a time.

1. Migration 4: the `feedback_kind` enum, the `feed_feedback` table and its index in `src/db/schema/user-data.ts`, generated with `pnpm db:generate`. Add `setFeedback`, `clearFeedback`, `feedbackFor` and `moreLikeThisIds` in `src/feedback/`, the `not_interested` clause in `unavailableMovies`, the `feedback` list in `exportUserData`, and the table in the completeness test and `user-tables.ts`. Satisfies **AC-4**, **AC-13**, **AC-14**
2. Thin thread: `setFeedbackAction` and a first `FeedbackControls` with only "Not interested", the Hidden line and Undo, wired into the feed card (`FeedItem` gets a `controls` slot rendered below the meta line, above the stretched link). Waits for the server, pending and error states, focus and live region. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-12**, **AC-13**
3. "More like this" toggle in `FeedbackControls`, with `FeedPick.moreLikeThis` filled by `moreLikeThisIds` in `loadFeedBatch` for the first batch and every Load more batch. Satisfies **AC-1**, **AC-5**
4. Recommender: `MORE_LIKE_THIS_WEIGHT` and `MORE_LIKE_THIS_ANCHORS` in `weights.ts` (and `weights.test.ts`); the feedback anchor read in `loadTaste`; the `source` field; strength and variety cap counting both kinds; the self pair skip in `scoreCandidates` and `reasonFor`; the `more_like_this` reason kind and its sentence. Satisfies **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-10**
5. Movie page: `loadMoviePage` also reads `feedbackFor`; `MovieDetailView` renders `FeedbackControls` under the reason by the AC-11 rule. Satisfies **AC-11**
6. Kept feed: `recordFeedback` in the feed store, called after every successful save on the feed and on the movie page; `FeedList` leaves out `hiddenIds` and applies each pick's `moreLikeThis` when it restores. Satisfies **AC-15**
7. Browser spec in `e2e/auth/` for the feed and movie page flows with axe scans, and update `src/feed/AGENTS.md`, `src/recommend/AGENTS.md` facts through `/sync` afterwards. Satisfies **AC-1** to **AC-15** (verification)

## Consequences

**Positive**:
- The feed learns after the first visit with no new service and no stored derived data; both effects come from two small additions to proven code.
- Every pick still says why, including picks the user asked for, so the user sees their tap working.
- One shared filter keeps feed, deck and movie page in agreement about what is hidden.
- The movie page doubles as the restore path for a dismissed movie, so a hidden list page can wait.

**Negative / tradeoffs**:
- A user who hides many movies has no list to review them; they can only restore one by opening its page by URL. The rows are in the export.
- At weight 1.0, ten feedback anchors can outweigh most rating anchors for a user with few ratings. The variety cap limits how many picks one anchor brings, and both numbers are one edit away in `weights.ts`.
- "More like this" shows no change on the current screen. Users who never press Load more or come back will not see its effect in that visit.
- The scoring query grows from at most 40 anchors to at most 50, a modest rise in a read that already takes about 700 ms inside Postgres.
- Each feed card gains two buttons, so a page of 24 cards has 48 more tab stops. The skip link and the card order keep it workable, and the accessibility pass (feature 18) should check it.
- The reason bar on a movie page stays as it was after a dismiss until the page is loaded again.
- `src/recommend/AGENTS.md` says a reason only ever names a liked rating; that rule now has a second kind.

**Neutral**:
- One additive migration, as spec 0002 planned (migration 4). No existing table changes.
- `FeedPick`, `Reason` and `KeptFeed` each gain one field, so their tests and the `/design` samples need updating.
- Feedback on a movie the catalog later withdraws stays in the table (the foreign key is restrict, and the catalog never deletes movies); it simply stops mattering because the movie is not listable.

## Follow-up

- [ ] A small "Hidden movies" page with Restore buttons, if users ask for it (could sit with the watchlist screens from feature 13).
- [ ] Rate limit for feed Server Actions (`loadMoreAction` and `setFeedbackAction`) together, if abuse shows up.
- [ ] Revisit `MORE_LIKE_THIS_WEIGHT` and the cap of 10 once there is real use; they are reasoned guesses like the other weights.
- [ ] After the build, `/sync` should update `src/recommend/AGENTS.md` (the reason rule, the anchor counts), `src/feed/AGENTS.md` (the controls, `FeedPick`) and add `src/feedback/AGENTS.md`.
- [ ] Accessibility pass (feature 18): check tab order on a full feed with 48 extra buttons.

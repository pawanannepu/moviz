# Review, main (re-review), 2026-11-11

**Reviewed by**: claude-sonnet-5-5 (author on a different model; earlier round by claude-opus-5-5)
**Scope**: 14 tracked files changed plus the untracked feature files, uncommitted (working tree on main vs HEAD). Primary focus: `src/db/failure.ts`, `src/recommend/recommend-movies.ts`, `src/recommend/recommend-movies.errors.test.ts`.
**Verdict**: Approve with nits

I ran the touched suites (10 files, 128 tests pass), `biome check` (clean) and `pnpm typecheck` (clean).

## Summary
The Major from the first round is fixed at the right choke point. `recommendMovies` now throws `unexpectedDbError("recommendMovies", error)`: a new `Error` with a fixed-shape message (`<where> failed: <ClassName> (code <SQLSTATE>)`) and no `cause`, no copied fields and no copied message. No query text, params, ids, scores or titles survive through the message, the stack header, the own fields or the cause chain. `db_unavailable` still returns as a typed result. The regression test is real. The new findings are small: the SQLSTATE is interpolated unfiltered, the clean error throws away the original stack frames (which makes real bugs hard to debug), and the helper has no unit test of its own. Of the earlier round's 9 findings, the Major is resolved, 1 minor is partly resolved, and the rest are still open and are low risk.

## Primary focus: does the fix stop the leak?

**Paths walked** (Drizzle 0.45.4 `DrizzleQueryError` sets `message = "Failed query: <sql>\nparams: <params>"`, plus own fields `query`, `params` and `cause`; `node_modules/drizzle-orm/errors.js:12`):
- **Message**: built only from the literal `where`, `constructor.name` (or `typeof` for a non-Error) and the code. Clean.
- **Stack**: `new Error()` is created inside the helper. Its stack is the new message plus frames from the `catch` in `recommendMovies`. It holds no original text. Clean.
- **Own fields**: none are copied. Clean.
- **Cause**: not set. Next.js prints `cause`, so this matters, and it is handled. Clean.
- **Other throw sites in `recommendMovies`**: Zod `safeParse` runs before the `try` and returns `invalid_input`. Everything that touches the database is inside the `try`. There is no second path that throws the raw error.
- **Downstream**: `loadFeedBatch` adds only a fixed-message throw (`invalid_input`) and propagates the clean error. `Feed` and `loadMoreAction` do not catch or log. `error.tsx` does not log. So the clean error is the only thing Next.js sees from the recommender. Both feed edges are covered.
- **`db_unavailable`**: `toDbFailure(error)` still runs first on the original error, so the mapping is unchanged. The test covers it through a `DrizzleQueryError` wrapping a `57P01` error.
- **Kind and code safety**: `kind` is `constructor.name`, not the writable `.name`, and falls back to `"Error"` when empty. For a non-Error it is `typeof`, which is safe. The code is only read when it is a string, otherwise `"none"`. The two real inputs (a pg SQLSTATE or a Node errno) are safe. See finding 1 for the one hole.

**Edge cases**:
- Thrown string, `null`, `undefined`, number: `errorChain` returns an empty list or stops at the first non-object, so you get `string (code none)` and so on. No crash, no data. Correct, but not tested (finding 3).
- Error with no `code`: `"none"`. Fine.
- A chain link with `code: undefined` hides a deeper real code (`"code" in link` matches the key, not a string). Rare, and it only loses information.
- Minified constructor names: Next.js minifies server bundles, so app-defined error classes would show as `t` or `e`. Drizzle and `pg` are external packages, and built-ins keep their names, so the common cases (`DrizzleQueryError`, `TypeError`, `DatabaseError`) read correctly. Nit only.

**Is the test a real regression test?** Yes. The old `throw error;` would throw a `DrizzleQueryError` whose message holds `user-secret-7f3a`, `424242` and `0.8765`, and whose own `params` field holds them too. `everythingLoggable` collects the message, the stack, all enumerable own fields and the `cause` chain, so the first test fails on the old code and passes on the new. The test builds the error with the real `DrizzleQueryError` class rather than a hand-made look-alike. The SQLSTATE test, the outage test and the plain `TypeError` test each guard one behavior. Gaps are in finding 3.

## Major
None.

## Minor

### 🟡 The error code is interpolated without checking its shape, `src/db/failure.ts:96`
**Problem**: The only free-form text in the new message is `pg.code`, accepted whenever it is a string. The helper's own doc says it keeps "only the kind of error and the SQLSTATE", but nothing enforces that. `chain.find((link) => "code" in link)` matches any object with a `code` key, for example an error from some other library, or a future driver that puts text in `code`.
**Why it matters**: It is the single remaining way for arbitrary text to reach the log from this helper. Today it is safe, because pg sets a 5-character SQLSTATE and Node sets an errno name. The guarantee depends on that staying true.
**Suggested fix**: Only use the code when it matches the real shapes, a 5-character SQLSTATE (`/^[0-9A-Z]{5}$/`) or a Node errno name (`/^E[A-Z]+$/`), otherwise report `none`. Pick the first link whose `code` is a valid string, so a `code: undefined` link does not hide a deeper one.

### 🟡 The clean error drops the original stack frames, so a real bug cannot be found from the log, `src/db/failure.ts:96`
**Problem**: The new error's stack starts at the `catch` in `recommendMovies`. For a SQLSTATE failure, `DrizzleQueryError (code 42883)` still points to a query class of bug. For a plain code bug the log reads `recommendMovies failed: TypeError (code none)` with a stack that ends at the catch, so the file and line where it broke are gone.
**Why it matters**: This is the price of the fix, and it is a real cost: the next unexpected failure in production will be hard to diagnose. Frames hold file paths and line numbers, not data, so they are safe to keep.
**Suggested fix**: Copy only the frame lines of the original stack (the lines that start with `at`, dropping the first line, which holds the message) onto the new error's stack. Leave `cause` unset. Test it with an original whose message holds the secret and whose frames do not.

### 🟡 `unexpectedDbError` has no unit test of its own, `src/db/failure.test.ts`
**Problem**: The helper is exported for other features to use (it is the fix for the grouped follow-up below), but `failure.test.ts` does not mention it. The only coverage is through `recommendMovies`, with one pg error shape, one `TypeError` and no non-Error throw. Also untested: no `code` (expects `none`), a code deep in the chain, a depth over 5, `null` or a string thrown, and a `cause` left unset. The helper `everythingLoggable` also ignores `AggregateError.errors`, non-enumerable own properties and symbol keys.
**Why it matters**: This helper is the privacy boundary. When about 20 other functions adopt it, a change to the helper's behavior needs a test that sits next to it.
**Suggested fix**: Add direct tests in `src/db/failure.test.ts` for the cases above, including that the result has no `cause` and no own fields beyond the standard ones. Add a feed level test (in `load-feed-batch.test.ts` or `actions.test.ts`) that the clean error is what leaves `loadFeedBatch` and `loadMoreAction`, since the spec's AC-14 is about the feed.

### 🟡 About 20 data functions still use the raw `throw error;` pattern (grouped follow-up)
**Where**: `src/ratings/{save-swipe,save-rating,undo-swipe,list-ratings}.ts`, `src/profile/profile.ts` (3 sites), `src/user-data/{delete-account,export-user-data}.ts`, `src/onboarding/{load-deck,count-progress,is-movie-listable}.ts`, `src/catalog/**` (8 files), `src/auth/auth.ts`.
**Problem**: Each rethrows the Drizzle error unchanged, with the same message that held query text and parameters. Outside this feature and known, so I list it once.
**Why it matters, and the severity I give it**: Minor for this change, because it is not new and not part of spec 0008. But it is the same defect that was a Major in round one, and the priorities inside it differ. The write paths in `src/ratings` (a swipe or a rating) put a movie id and a score in the params, so they break the same AGENTS.md rule and are called from Server Actions that Next.js logs. `getProfile` in `src/profile/profile.ts` is called by `/home` itself, but its params hold only the user id. The catalog files hold no personal data. Fix the ratings files first.
**Suggested fix**: Adopt `unexpectedDbError(where, error)` in the `catch` of each function, in the order above. Give each one the same regression test shape as `recommend-movies.errors.test.ts`.

## Nits
- ⚪ `src/recommend/AGENTS.md:29`, and spec 0007 AC-15 (`index.md:36`): both still say any other error "is rethrown". It is now thrown again as a clean error. Update the line to say so, or the next reader will think the raw error escapes.
- ⚪ `src/recommend/recommend-movies.ts:89-90`: the doc comment line runs past 80 columns ("...(`unexpectedDbError`). It reads only this user's ratings"). Biome does not reflow comments, so rewrap it by hand.
- ⚪ `src/db/failure.ts:94`: `constructor.name` is mangled for classes defined in app code once Next minifies the server bundle (`t`, `e`). Fine for Drizzle, `pg` and the built-ins. If you define your own error classes, give them a stable string field to use as the kind.
- ⚪ `src/db/failure.ts:88`: `where` is a free `string`. It is a call-site constant, so it is safe today, but a literal union or a `string` that is documented as "never data" would keep a caller from passing an id.

## Earlier findings (docs/reviews/2026-11-11-main.md)

| # | Finding | Status |
|---|---|---|
| Major | Unexpected recommender errors reach the log with rating data | **Resolved** by `unexpectedDbError` in `recommendMovies`, with a real regression test. See the primary focus above. Two small follow-ups are the minors above. |
| Minor 1 | No focus ring after a programmatic focus move following a pointer press (`src/ui/load-more-bar.tsx:60`) | **Open**. `load-more-bar.tsx` is unchanged. No keyboard-path `:focus-visible` assertion was added. Still low risk, because the keyboard path should show the ring. |
| Minor 2 | `home/error.tsx` retry has no double press guard | **Open**. `error.tsx` still passes `retry` straight to `onRetry` with no pending guard and no status. |
| Minor 3 | Browser coverage misses done state, `session_ended`, reduced motion beyond overflow | **Open**. `e2e/auth/feed.spec.ts` has no done-state axe scan, no lost session test and no `:focus-visible` check. The reduced motion test still checks overflow only. |
| Nit 1 | `design.md` Error copy drift | **Open**. `design.md:112` still reads "Couldn't load your picks" while the code says "We couldn't load your picks." (the Empty feed line was updated). |
| Nit 2 | Empty status `<p>` takes a `gap-3` slot (`load-more-bar.tsx:74`) | **Open**. Unchanged, `min-h-0` is still on the element. |
| Nit 3 | `LoadMoreResult` has no doc comment (`src/feed/actions.ts:25`) | **Open**. |
| Nit 4 | `src/recommend/AGENTS.md` table re-padding churn | **Open**. Still in the diff. |
| Nit 5 | `waitForHydratedBar` uses React's private `__reactProps` key (`e2e/auth/feed.spec.ts:64`) | **Open**. |

None of the open items is a regression or a new risk. I raise no new significant findings in the older files. The rest of the feature diff (`page.tsx`, `feed.tsx`, `actions.ts`, `load-feed-batch.ts`, `feed-list`, `load-more-bar`) matches the spec and the AGENTS.md rules.

## Strengths
- The fix lives at the single choke point (`recommendMovies`), so neither feed edge can leak, and it removes `cause`, which Next.js prints.
- `toDbFailure` still sees the original error first, so `db_unavailable` behavior is exactly as before.
- The regression test builds the error with the real `DrizzleQueryError`, and it checks message, stack, own fields and cause chain in one helper. It also keeps the SQLSTATE and the outage mapping under test.
- The kind-and-SQLSTATE message keeps the log useful for query-class bugs without carrying data.

## Test coverage
Configured (Vitest, Playwright plus axe). The new regression test is meaningful and fails on the old code. Untested new logic: `unexpectedDbError` edge cases (no code, non-Error throws, deep code, depth limit, no `cause`), and a feed-level check that the clean error leaves `loadFeedBatch` and `loadMoreAction`. Browser coverage gaps from round one (done state, lost session, `:focus-visible`, reduced motion) are unchanged.

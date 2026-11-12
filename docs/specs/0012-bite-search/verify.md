# Verify: Bite search · spec 0012 · updated 2026-11-12
_Steps derived from spec 0012 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Set up: a signed in, onboarded user on the dev server. The dev server reads `VOYAGE_API_KEY`, so it runs vibe mode. Remove the key (or point Voyage at a dead address) to see words mode. Check `search_usage` for the user with a read only query between steps.

## UI / manual
- [x] Signed out, open `/search` → 307 to `/sign-in?returnTo=%2Fsearch` → AC-1
- [x] Signed in but not onboarded, open `/search` → redirect to `/onboarding` → AC-1
- [x] On `/home`, the header shows "Search by mood" → opens `/search` with the `h1` "Search by mood", the field "Describe what you feel like watching", "Find picks", and the three example buttons → AC-1
- [x] Press an example → the field fills, no search runs, quota unchanged → AC-1
- [x] Submit " a " → "Type at least 2 characters.", focus on the field, no `search_usage` change. Submit 121 characters → "Keep it under 120 characters." → AC-2
- [x] Submit "  a   slow   thriller  " → the heading reads "Picks for “a slow thriller”" (trimmed, spaces collapsed) → AC-2
- [x] Submit a valid phrase → `search_usage.count` for today (UTC) goes up by exactly 1 → AC-3
- [x] Set today's count to 30 in the database, submit → "You have used today's 30 searches. More after {time}." where `{time}` is UTC midnight in the browser's time zone; no Voyage call; count stays 30 → AC-3
- [x] Submit "a slow moody thriller from the 90s" → "Looking for: from the 1990s"; every card's year is 1990 to 1999 → AC-4, AC-5
- [x] Submit "something short and funny" → "Looking for: under 100 minutes"; open a few cards, each runtime is 100 minutes or less → AC-4, AC-5
- [x] Submit "under 2 hours" → "Looking for: under 120 minutes". Submit "short epic" → no "Looking for" line. Submit "80s or 90s" → no year filter → AC-4, AC-5
- [x] Results show at most 8 cards; none is a movie the user rated, skipped or marked "Not interested" → AC-6
- [x] With liked ratings, some reasons read "Fits “…”, close to {Title} ({Year})"; a user with no ratings sees only "Fits “…”" → AC-7, AC-8
- [x] A phrase over 40 characters shows in reasons cut to 40 with "…" → AC-8
- [x] With Voyage unavailable → the line "Simple search this time: these match your words, not the mood." and reasons "Matches your words “…”"; no error shown → AC-9
- [x] Words mode with only filter words or stop words ("the short") → the empty state → AC-9, AC-12
- [x] While a search runs → the button reads "Searching…" with `aria-disabled="true"`; a second Enter does nothing; the field keeps its text → AC-10
- [x] Results arrive → focus on the "Picks for “…”" heading; the live region says "8 picks for {phrase}" (or "1 pick for …"); each card opens `/movie/[id]`; no feedback buttons on cards → AC-11
- [x] Submit "funny under 1 minutes" → "Nothing fits “…”." with "Try fewer or different words." and the "Looking for" line, focus on that heading, announced → AC-12
- [x] Make the database unreachable for the action → "Search is not working right now. Try again.", field kept, focus on the message → AC-12
- [x] Revoke the session (delete the `session` row), submit → "Your session ended." with "Sign in again" to `/sign-in?returnTo=/search`, focus on the link → AC-12
- [x] After results, open a card, press browser Back → the same phrase and cards, focus on the opened card, `search_usage` unchanged → AC-13
- [x] Reload `/search` → empty form, no results → AC-13
- [x] From the movie page, "Back to picks" goes to `/home` → AC-13
- [x] Sign out, sign in as another user in the same tab, open `/search` → no kept results → AC-13
- [x] axe (WCAG 2.1 AA) passes on the form, results, empty, error, quota and session ended states → AC-1, AC-11, AC-12

## Commands
- [ ] `pnpm typecheck` and `pnpm check` → clean → all
- [ ] `pnpm test src/search src/user-data src/catalog/cron src/catalog/http src/catalog/embedding src/db/schema` → green (database tests need `DATABASE_URL_TEST`) → AC-3, AC-15, AC-16
- [x] Read only SQL on dev: `search_usage` exists with primary key (`user_id`, `day`) and the cascade key to `user` → AC-15
- [x] Export a user who searched → `searchUsage: [{ day, count }]`, no phrase anywhere → AC-15
- [x] Delete that user → their `search_usage` rows are gone (cascade) → AC-15
- [x] `grep -rn "console\." src/search` → nothing; a failing search logs no phrase, title, id or score → AC-15
- [x] `curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/catalog` → the body carries `purged: { searchUsage, rateLimit, session, verification }`; with a provider key unset → `{ error: "config_missing", purged: {...} }` (the purge still ran) → AC-16
- [x] Insert a `search_usage` row 31 days old and one from today, a `rate_limit` row 2 days old, and a `session` 2 days expired; run the cron → the old rows are gone, today's row stays → AC-16

## Value sourcing
- [x] The user comes from the session only: send `biteSearchAction({ phrase, userId: "someone-else" })` → it charges and searches for the signed in user → Value sourcing: user
- [x] Onboarded: clear `profiles.onboarded_at` and submit → the client goes to `/onboarding`, no quota spent → Value sourcing: onboarded
- [ ] `day` and `resetsAt` come from SQL UTC: shortly before UTC midnight, search with the browser in another time zone → the row's `day` is the UTC date, and the quota message shows UTC midnight converted to local time → Value sourcing: day, resetsAt, `{time}`
- [x] Current year for "recent" is the server UTC year: "something recent" → "from {UTC year minus 3} on" → Value sourcing: current year
- [x] Phrase vector is a Voyage `query` embedding: inspect the request body (fake endpoint) → `input_type: "query"`, `output_dimension: 1024`, one try → Value sourcing: phrase vector
- [x] Anchors come from `loadTaste` in the same transaction: rate a movie 10, then search → a close result names it; mark another "More like this" → it can be named too; a disliked movie is never named → Value sourcing: anchors, reason
- [x] Score blend: a movie equal to the phrase and near a liked anchor ranks above an equal one that is not → Value sourcing: score
- [x] Words mode ranking: a title match ranks above an overview match → Value sourcing: words mode ids
- [x] Kept results are in memory only: no `localStorage`, `sessionStorage`, cookie or URL holds the phrase → Value sourcing: kept results

## Acceptance-criteria coverage
- AC-1: guard, onboarding gate, header link, page parts, examples, axe
- AC-2: too short, too long, normalization
- AC-3: one charge per search, the 31st refused with local time, no refund
- AC-4 and AC-5: the 90s, short, under 2 hours, contradictions, "Looking for" line
- AC-6: at most 8, exclusions
- AC-7 and AC-8: anchor reasons, no anchor, the 40 character cut
- AC-9: words mode line and reasons, empty with no terms
- AC-10: pending button, double submit
- AC-11: focus, announcement, card links, no feedback buttons
- AC-12: empty, error, session ended
- AC-13: Back restore, reload, Back to picks, user switch
- AC-14: session first, user from session, onboarding redirect
- AC-15: migration live, export, delete cascade, no logging
- AC-16: cron body with `purged`, purge before config check, old rows removed

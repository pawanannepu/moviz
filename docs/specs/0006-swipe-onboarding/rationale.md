# 0006. Swipe onboarding: rationale

This file holds the reasoning behind [index.md](index.md). A build does not need it.

## Context

Moviz promises a feed where every pick says why it was chosen. A brand new user has no ratings, so the feed has nothing to work from. The scope asks for a deck of well known movies where the user says liked, disliked or not seen, so that a taste profile exists within a minute of signing up.

Much of the ground is already laid. Spec 0002 designed the tables and the `saveSwipe` function (liked 8, disliked 2, not seen as a skip), the `profiles.onboarded_at` column and the shared exclusion filter. Spec 0003 holds about 3,000 movies with vote counts and posters. Spec 0004 built the swipe card and deck, with three labelled buttons, drag and arrow keys. Spec 0005 put a live session behind every protected page. What is left is the decisions that tie these together: which movies, in what order, how long, when a person may stop, what happens on a mistake, and where this lives in the route tree.

Two forces shape the answer. First, a "not seen" swipe carries no taste signal, so a deck of obscure films wastes cards and a person who has seen few films can get stuck. Second, the first run is the only moment every user passes through, so a slow or lossy save, a trap with no way out, or a screen that fails for keyboard and screen reader users costs the most here. Without a decision, the card would show a movie but nothing would be saved, and `/home` would stay a placeholder that never asks for taste.

## Options considered

### Option 1: A dedicated `/onboarding` page, deck built on the server, one Server Action per swipe

The page loads the pool, orders and filters it on the server, and hands the cards to one client component. Each swipe calls a Server Action and the next card shows after the save returns. `/home` redirects unfinished users to the page.

**Pros**:
- Matches the swipe card contract in spec 0004 (pending, then next card, or spring back on failure).
- Nothing is shown as saved that is not, and leaving at any point loses nothing.
- `/home` and the deck keep separate jobs, so feature 9 replaces `/home` without moving the deck.
- All rules (pool, order, minimum, finish) sit in pure functions that are cheap to test.

**Cons**:
- One database round trip before each next card.
- A new route, a gate in `/home`, and three Server Actions to build and test.

### Option 2: Advance at once and save in the background

The card changes immediately and a queue of writes drains behind it, rolling back when one fails.

**Pros**:
- The deck feels instant.

**Cons**:
- A failed save has to undo a card the person has already moved past, which is confusing.
- Leaving quickly can drop queued writes, which breaks "stop at any point".
- It needs a client side queue, retry rules and ordering with undo, much more than the problem needs.

### Option 3: Put the deck on `/home` itself

`/home` shows the deck until the user finishes and the feed afterwards.

**Pros**:
- No redirect and no extra route.

**Cons**:
- `/home` gets two very different jobs, and feature 9 would have to pull the deck back out.
- Every link to `/home` changes meaning, and a finished user has no clear page that is only the deck.

### Smaller decisions

| Decision | Chosen | Runner up | Why |
|---|---|---|---|
| Pool | Top 150 listable by vote count | Top 150 by popularity | Vote count tracks how widely a film is seen. Popularity swings with new releases and drops older classics. |
| Order | Genre rotation, same for everyone | Shuffle per user | Ten ratings then cover many kinds of taste, and a fixed order is easy to test and to reproduce in a bug report. |
| Rotation rule | First remaining movie sharing no genre with the previous two, else the first remaining | Rotate by one "main genre" | The catalog stores genres as an alphabetical set, with no main genre, so the rule uses only what exists. |
| Order computed over | The whole pool, then filtered | The remaining cards only | A user who resumes would otherwise get a different order depending on their last two swipes. |
| Stop point | 10 ratings | 5 or 15 | Ten is enough for a first thin profile and short enough that people finish. Not seen does not count. |
| Cap | 20 ratings or 30 cards, once 10 are rated | Hard 30 cards | A hard cap could leave a person who has seen few films with nothing to finish on. |
| Gate | Required until "See my picks" | Skippable | The feed has nothing to rank without ratings, so a skip lands on an empty feed. |
| Where the gate lives | The `/home` page and the `/onboarding` page | The proxy | The proxy only sees the cookie (root `AGENTS.md`), so it cannot read `onboarded_at`. |
| Undo | Last swipe only, toast plus a stable button | Toast only | A toast that disappears fails people who cannot reach it in time. The button has no timer. |
| Progress | Text counter | A progress bar | A bar is not in `design.md`, so it would be a new component. |
| End of deck | An end state with a button | Redirect at once | A sudden page change after a swipe is disorienting and can lose the last announcement. |
| Revisit | `/onboarding` redirects finished users to `/home` | A "Swipe more" link | Later rating belongs to the feed, the detail page and the seen list. |
| Rated count | All ratings, any source | Swipe ratings only | It is the number the feed will care about, and it lets an import count towards "enough". |
| Design source | The existing `design.md` and UI | A design tool | The wireframe for this screen is already in spec 0004. No new visual piece beyond a counter line and a text button. |

## Rationale

Option 1 fits the forces. The save contract already exists in the swipe card, the writes are already idempotent and locked (spec 0002), and one round trip per card is small next to the cost of showing a swipe that was not saved. Option 2 buys speed nobody has measured a need for and pays for it with rollback and lost writes, which hurts the first run most. Option 3 saves one route today and costs a rewrite when the feed arrives.

The order and cap rules answer the first force. Choosing the most voted movies keeps "not seen" rare, rotating genres makes each rating add new information, and lifting the cap below 10 ratings means a person who has seen few films is not trapped. The server runs the same `deckStatus` as the screen, so the minimum cannot be skipped with a hand made request. The accessible undo button is a deliberate step past the toast the engineer chose: the toast stays for the quick cue, and the button removes the timer for keyboard and screen reader users.

No migration is needed because spec 0002 already put `onboarded_at`, `ratings` and `swipe_skips` in place, which is the point of designing the model whole.

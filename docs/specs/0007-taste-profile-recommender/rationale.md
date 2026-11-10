# 0007 rationale: taste profile and recommender

## Context

Moviz promises that every pick in the feed says why it was chosen. That promise decides most of this feature. A recommender can be accurate and still unable to explain itself, and an explanation that is invented after the fact is worse than none. So the question is not only "which movies are close to your taste" but "which method lets us name the movie that caused each pick".

The raw material already exists. The catalog stores a 1024 dimension vector (embedding) for each listable movie, built from the title, genres, tagline, overview, director and top cast (spec 0003). Ratings are scores from 1 to 10 from three sources: swipes (liked 8, disliked 2), manual ratings and Letterboxd imports (spec 0002). The shared `unavailableMovies` filter already hides rated and skipped movies. Spec 0002 settled one more thing: taste and reasons are computed when read, not stored.

Three forces shape the design. First, the catalog is small, about 3,000 movies, so an exact scan against a few dozen rated movies is cheap and no index or cache is needed. Second, the user base is thin at the start: spec 0006 lets a user finish onboarding with fewer than 10 ratings, so the method must give something useful from one or two likes and something honest from none. Third, there is no real usage data yet, so any tuning is a guess, which argues for few knobs kept in one place.

The feed in feature 9 depends on this feature's output shape. Feature 14 (feedback) and feature 11 (import) will add signals later, so the method should accept more input without changing its contract.

## Options considered

### Option 1: Closest liked and disliked rated movie (chosen)

Score every unrated movie by how close it is to the user's rated movies. Take the single best liked match and the single best disliked match, weighted by how strongly the user rated them, then subtract a share of the dislike. The liked movie that gave the best match is the reason.

**Pros**:
- The reason falls out of the maths: the best matching liked movie is the cause of the score, so "because you rated X highly" is always true.
- Max pooling keeps separate tastes separate. A fan of both crime thrillers and animation gets both, instead of an average that sits between them.
- Uses data that exists (embeddings), adds no table, and handles one like as well as fifty.

**Cons**:
- Each call compares every candidate with every anchor. Fine at 3,000 movies, but it grows with the catalog.
- One strong match can dominate, so a variety rule is needed.
- Similarity values are compressed, so the weights need tuning.

### Option 2: One taste vector

Average the embeddings of liked movies (minus disliked) into one vector for the user, then return the nearest movies.

**Pros**:
- Simplest and fastest: one vector, one nearest neighbour query, and it could use the HNSW index.
- Easy to explain in code.

**Cons**:
- An average of unrelated tastes lands between them and matches neither well.
- It cannot say which movie caused a pick, which breaks the product promise. A reason would have to be found afterwards, by searching for the nearest rated movie, and that is Option 1 with extra steps.

### Option 3: Genre and people counting

Score by shared genres, directors and actors with liked movies, with hand tuned weights.

**Pros**:
- Very easy to explain to a user ("you like Michael Mann").
- No dependence on the embeddings job.

**Cons**:
- Ignores plot and tone, which the embeddings carry, and genres are coarse (the TMDB list has about 19).
- Needs several hand tuned weights with no data to tune them against.
- It would waste the work spec 0003 did on embeddings.

### Option 4: Hybrid of embeddings and genre match

Embedding similarity plus a bonus for a shared genre, director or actor.

**Pros**:
- Richer reasons ("also directed by ...") and possibly better ranking.

**Cons**:
- Two systems to tune before any data exists, and more joins per pick.
- The extra signal is mostly already inside the embedding text, so the gain is unproven. It can be added later behind the same result type.

## Rationale

Option 1 is the only one where the reason is a by product of the score, which is what the product promises. Option 2 is simpler but loses exactly that, and its blur on mixed tastes would show up in the first feed. Options 3 and 4 add tuning work that nothing can check yet.

The catalog size removes the usual objection. At about 3,000 movies and at most 40 anchors, an exact scan is about 120,000 similarity checks, and spec 0002 already decided exact scans are right at this size. The premature optimisation rule applies: no cache and no index until a measured problem.

The design is built to be tuned, not trusted. Every weight is a named constant in one file, the order is deterministic so a golden test can pin it, and the result carries a structured reason, so the feed can change wording without touching ranking.

### Decisions inside the chosen design

Each of these was settled by the engineer (marked Asked) or decided here (marked Decided), with the runner up.

| Decision | Pick | Why, and the runner up |
|---|---|---|
| Ranking method | Closest rated movies (Asked) | Reason falls out of the score. Runner up: one taste vector. |
| Rating to weight | Fixed midpoint 5.5, span 4.5 (Asked) | Works for swipe only users and for users who only liked things. Runner up: centre on the user's average, which gives a user who only liked things zero signal. |
| Popularity | Small nudge, 0.1 at most (Asked) | Keeps thin profiles on solid films. Runner up: pure taste. |
| Thin profile | Always rank, flag it, fall back to popular at zero likes (Asked) | Spec 0006 allows fewer than 10 ratings. Runner up: return empty below a minimum. |
| Reason shape and count | Structured, one reason (Asked) | Matches the one line reason bar. Runner up: up to three anchors. |
| Paging | Limit plus `shown` ids (Asked) | Stateless and safe when the user rates between pages. Runner up: a keyset cursor, which repeats or skips when scores move. |
| Variety | Cap per anchor in a batch (Asked) | Cheap, deterministic, and makes reasons differ. Runner up: MMR re ranking. |
| Surface | Server function only (Asked) | No endpoint before the feed that uses it. Runner up: add a Server Action now. |
| Taste profile object | Small summary in the result (Asked) | Drives the flag and fallback. Runner up: add top genres and people. |
| Strength line | 0 none, 1 to 4 thin, 5 or more ok (Asked) | Spec 0006: 10 ratings usually include 5 likes. Runner up: 3 or more. |
| Anchor cap | 40 (Asked), taken as 30 liked plus 10 disliked (Decided) | A plain "40 strongest" lets 40 low scores crowd out a handful of likes and leave no liked anchor. The split guarantees likes are always present. Runner up: separate caps of 40 each, which doubles the cost. |
| Data model | Nothing stored (Asked) | Spec 0002's rule. Runner up: a taste snapshot table. |
| No embedding | Left out in taste mode (Asked) | The reason promise needs a similarity. Runner up: append at the end. |
| How scores combine | Max over liked, max over disliked, dislike weighted 0.5 (Decided) | Max keeps tastes separate. A sum would reward many mediocre matches and make a heavy rater's feed bland. Runner up: sum of the top 3 neighbours. |
| Dislike weight | 0.5 (Decided) | A dislike should push, not ban: two films can share a genre and differ in quality. Runner up: 1.0, which over punishes whole genres. |
| Popularity formula | Rating out of 10 times a vote confidence that reaches 1 at 5,000 votes (Decided) | A film with 12 votes and a 9.0 should not look like a classic. Runner up: raw `popularity` column, which TMDB changes daily. |
| Candidate fetch | 300, then apply the cap, then fill (Decided) | Enough depth for a cap without a second query. The fill pass means the cap is a preference, never a reason for a short batch. |
| Cap formula | `max(3, ceil(limit / likedAnchors))` (Decided) | Guarantees anchors times cap is at least the limit, so one anchor alone can still fill a batch. |
| Fallback order | `vote_count` descending, then id (Decided) | Same order as the onboarding pool in spec 0006, so the two features agree on "well known". Runner up: `vote_average`, which favours obscure films with few votes. |
| Dev preview script | None (Decided) | A script that prints reasons would put rating content in a terminal for little gain. Tests and the real feed are the check. |
| Consistency of one call | One read only `REPEATABLE READ` transaction (Decided, from the cross check) | Counts, anchors, scores and reasons must agree, or a re-rate in between could leave a reason that says "liked" for a movie now rated low. Runner up: one giant SQL statement, which is harder to read and test. |
| Where anchor vectors live | Inside the database, a materialized CTE (Decided, from the cross check) | Sending 40 vectors of 4 KB to Node and back is pointless and slow. Runner up: pass them as parameters. |
| Order after the variety pass | Sort again by score then id (Decided, from the cross check) | Keeps AC-1 true after the fill pass appends picks. Runner up: leave the fill picks at the end, which breaks the sorted promise. |
| Empty taste result | Fall back to the popular list (Decided, from the cross check) | A user with likes but no embedded candidates should not see an empty feed. Runner up: return an empty list and flag it. |
| Nudge scaling | Leave fixed at 0.1 and document it (Decided, from the cross check) | Scaling by the user's strongest weight adds a knob with no data to set it. Runner up: scale `PRIOR_WEIGHT` by that weight. |

## Evidence

No web research was done and no inventory was needed. The facts used come from the repo:

- Embedding recipe and dimension: spec 0003 and `src/catalog/embedding/`.
- Rating scores, sources and the swipe weights (8 and 2): spec 0002, `src/ratings/swipe-score.ts`.
- The shared exclusion filter and the listable rule: `src/user-data/exclusions.ts`, `src/catalog/listable.ts`.
- The card shape a pick must fit: `MovieCardMovie` in `src/ui/movie-card.tsx` (spec 0004).
- The fallback ordering mirrors the onboarding pool: spec 0006, AC-2.

A read only cross check by a second model (Opus) found the design sound and the AC-10 claim true (the nudge adds between 0 and 0.1, so it cannot reverse a taste gap larger than 0.1). It listed 14 decision gaps, mainly the exact SQL shape, the null and empty set handling, the order after the variety pass, the consistency of one call, and several tests. All were closed in `index.md` on the engineer's choice to apply the recommended fixes.

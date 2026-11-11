# 0012. Bite search: rationale

## Context

Scope feature 15 asks for a search by mood: a short phrase in, a few picks out, each with a reason, shaped by the user's taste. The catalog already holds a Voyage vector for every listable movie (spec 0003), and the recommender already knows how to read a user's liked anchors and hide movies they dealt with (specs 0007 and 0011). Spec 0002 already fixed the cost guard (30 searches per user per UTC day, charged before the provider call) and the full text column that a fallback can use.

The hard part is that people mix two kinds of words in one phrase. Mood words ("funny", "cosy", "tense") are what vectors are good at. Limit words ("short", "under 2 hours", "from the 90s") are hard rules, and a vector treats them as a faint flavour at best: a search for "short" can easily return a long film that is described as brisk. Users notice that at once and stop trusting the feature.

The forces: a solo builder, no budget for a new paid service per search, a strict rule that ratings content never goes to logs or analytics, and an accessibility bar of WCAG AA. Search must keep working when Voyage is down, because the free tier of Voyage is rate limited and has failed before during the catalog seed.

## Options considered

### Option 1: Embeddings only

Embed the whole phrase with Voyage, rank by similarity, blend with taste.

**Pros**:
- Smallest build; one query and one call.
- Handles any mood wording.

**Cons**:
- Limit words are mostly ignored, so "short" and "80s" searches often fail in a visible way.
- Nothing tells the user what was understood.

### Option 2: Embeddings plus a word rule parser (chosen)

Embed the phrase for the vibe, and run a small pure parser that turns a fixed list of limit words into runtime and year filters.

**Pros**:
- The common hard limits work every time, and the "Looking for" line shows them.
- No new provider, no new secret, nearly free, and the parser is a pure function that is easy to test.

**Cons**:
- Only listed words become filters; anything else falls back to the vector.
- The list needs care so it does not misfire (whole word matching, contradictions).

### Option 3: An LLM reads the phrase first

Send the phrase to a small LLM (for example Claude Haiku) to extract filters and a cleaner vibe sentence, then embed that.

**Pros**:
- Understands odd phrasing, written numbers and negations.
- Could map moods to genres as well.

**Cons**:
- A new provider, a new key, a cost on every search, and a second network call inside the time budget.
- One more place the phrase goes, which the privacy policy must list, and one more failure mode.
- The engineer chose not to add it.

## Rationale

Option 2 fixes the failure users notice most (a limit they typed being ignored) without adding a service. The parser covers the limit words people actually use in a bite search, runtime and era, and the transparency line turns its limits into something the user can see and correct. Moods stay with the vector, which is what it is good at.

Option 3 would understand more, but for a solo, free product it adds a running cost and a second provider in the hot path for a gain that the word list mostly covers. It stays easy to add later: the parser's output shape (`PhraseFilters`) is exactly what an LLM step would produce, so it can replace `parsePhrase` without touching scoring. Option 1 is simpler, but it ships a feature that visibly fails its own example phrase ("something short and funny").

The blend weight (0.25) keeps the phrase in charge: two movies that fit the phrase about equally are ordered by taste, but taste cannot pull an unrelated movie above a strong match. Like the recommender's weights, it is a reasoned guess, kept in one file and pinned by a test.

# 0002. Data model: rationale

The decision record for [index.md](index.md). The build does not read this file.

## Context

> ⚠️ Premise note: This spec designs tables for slices that are not built yet, and two inputs are still open. The movie data source is undecided (spec 4), and the Better Auth tables do not exist until the CLI generates them. Designing ahead risks columns nobody uses. The risk is small here because the movie columns are common metadata and every provider specific detail goes in through additive migrations. Unknowns are stated as assumptions: spec 4 can fill or add movie columns, and spec 16 owns the one table this spec leaves out.

Moviz is one Next.js app on Postgres (Neon, with pgvector), using Drizzle and Better Auth (spec 0001). Every later slice reads or writes the same few things: who the user is, which movies exist, and what the user thinks of them. Swipe, the feed, Letterboxd import, the watchlist, feedback, and mood search all depend on these records. A shape that is wrong early gets copied into every slice, so migrations later become breaking.

The scope sets the bar for this feature: entities and relationships must support all planned slices without a breaking migration, and a user's data must be exportable and deletable. The product is for film fans, runs free with one builder, and handles personal data (an email address and a record of taste). Spec 17 is a GA tier feature, so export and delete must be easy to prove, not just present.

Other forces: the app runs on serverless functions with a pooled Postgres connection, so transactions must be short and simple. Scale is small (a few thousand movies, a modest number of users), so correctness and clarity matter more than query tricks. Spec 0001 already fixed text user ids with cascade deletes, UTC timestamps, one stored embedding per model, and asked this spec to settle the embedding dimension.

Not deciding now would leave the first slice inventing its own tables, and each later slice would reshape them.

## Options considered

### Option 1: Narrow tables, designed whole, migrated per slice

One table per meaning (ratings, watchlist entries, skips, feedback, imports). The whole model is designed in this spec; each migration is created in the slice that first needs it. Derived data (taste profile, reasons) is computed when read.

**Pros**:
- Each table has one clear rule enforced by its key; hard to put the data in an impossible state.
- Later slices add tables without touching old ones.
- Export and delete are a short list of tables, easy to test for completeness.

**Cons**:
- Hiding movies from the feed takes a query over several tables.
- Designs some columns before their data source is final.

### Option 2: Design each slice's tables when that slice starts

Only slice 1 tables are designed now. Every later slice designs its own.

**Pros**:
- Least up front work; no guessing about later slices.

**Cons**:
- Later slices can force changes to shared tables (ratings, movies), which is the breaking migration the scope wants to avoid.
- No single place proves export and delete cover everything.

### Option 3: One wide row per user and movie

A single `user_movies` table with nullable score, watchlisted, skipped, and dismissed columns.

**Pros**:
- One lookup answers "what do we know about this user and movie".
- One table to export and delete.

**Cons**:
- Many states combine in odd ways (seen and dismissed, rated and skipped), and each combination needs a rule.
- Every new feature adds nullable columns to the hottest table.

### Option 4: Append only event log with derived state

Every swipe, rating, and dismissal is an event row, and current state is a rollup.

**Pros**:
- Full history for the recommender and "how your taste changed".
- Writes are simple inserts.

**Cons**:
- Every read needs a rollup; the feed and the deck both get slower and more complex.
- Export and delete carry the whole history, and the product has no feature that needs it yet.

## Rationale

Option 1 fits the forces. The scope's main requirement is no breaking migration, which rules out Option 2 (shared tables get reshaped slice by slice) and favours designing the whole model once. The product is small and run by one person, so the model has to be easy to hold in your head and easy to prove correct; narrow tables with composite keys put each rule in the database (one rating per movie, one feedback row per movie), where Option 3 would put them in code and Option 4 in rollups. The extra feed query for hiding movies is a few `NOT EXISTS` checks on primary keys, which is cheap at this scale.

Computing the taste profile and reasons when read follows the rule of not storing derived values without a measured problem. Stored profiles would need updating on every swipe, import, and delete, and a missed update would show wrong reasons. If profiling later shows a cost, adding a cache table is additive and does not break anything.

Migrating per slice keeps Tracer Bullet honest: each slice ships a working thread with only the tables it needs, while the design stays whole. You chose this over creating everything up front, which would leave empty tables and unused columns around.

## Decision log

Each sub decision, the pick, and the runner up. All were chosen with you during the interview unless marked *(my call)*.

| Decision | Pick | Runner up |
|---|---|---|
| Spec scope | Design all now, migrate per slice | Slice 1 tables only |
| Movie tables | Core shape here, sourcing in spec 4 | Thin movies table only |
| Opinion shape | Narrow tables | One wide row per user and movie |
| Rating scale | Half stars as smallint 1 to 10 | Three state sentiment |
| Not seen swipe | Skip row | Do not store |
| Meaning of seen | Seen means rated | Separate seen table |
| Derived data | Compute on read | Stored taste profile row |
| Key types | Bigint identity for movies; composite keys for user rows | UUID everywhere |
| Embeddings | Separate table, 1024 dims, keyed by movie and model | 512 dims |
| Profile | Separate `profiles` table | Columns on the Better Auth user |
| Genres | Genres plus join table | Text array |
| People | People plus credits tables | JSON on the movie |
| Swipe scores | Liked 8, disliked 2 | 10 and 1 |
| Re rating | Overwrite, one row, latest wins | Import never overwrites manual |
| Watchlist rule | Remove automatically on rating | Leave entry in place |
| Feedback rows | One row per user and movie | Allow both kinds |
| Import records | Run row plus unmatched rows | Counts only |
| Deletion | Immediate hard delete by cascade | 30 day soft delete |
| Export | One JSON file, built on request, with titles | JSON plus Letterboxd style CSV |
| Search usage | Daily counter table, phrases not stored | Counter plus search history |
| Matching | Normalized title plus year, with alternate titles | Add trigram fuzzy matching |
| External ids | Provider neutral table | `tmdb_id` and `imdb_id` columns |
| Full text | Generated tsvector with GIN | Compute at query time |
| Extra movie fields | `popularity`, `vote_average`, `fetched_at` | Add backdrop, tagline, certification |
| Row access | App level scoping only | Postgres row level security |
| Auth schema | Generate in this build from a minimal config | Stub user table |
| Search day | UTC day | User's local day |
| References | None | Sources only |

My calls, settled when writing the spec:
- *(my call)* `ratings` keeps both `rated_at` (first rated) and `updated_at` (last change), so the import can later say "rated on" and lists sort by recent change.
- *(my call)* Saving a rating also deletes a skip for the same movie; a skip means "not seen", which a rating contradicts.
- *(my call)* `imports` has only `completed` and `failed`. Import runs inside one request and one transaction, so a `processing` state would never be visible and a crash would leave stuck rows.
- *(my call)* Duplicate movies in one CSV become `duplicate` unmatched rows (first wins), because one upsert statement cannot touch the same row twice.
- *(my call)* Enums are Postgres enums via Drizzle, not text with checks, for typed code. Adding a value is an additive migration.
- *(my call)* User to movie foreign keys use `ON DELETE RESTRICT`; catalog child tables cascade from `movies`. The app never deletes movies, so a catalog sync can never silently remove a user's rating.
- *(my call)* The HNSW index uses default settings and cosine distance (spec 0001). Tuning waits for measurement.
- *(my call)* `deleteAccount` removes `verification` rows by email, because that table is keyed by the identifier, not by user id, and cascade would miss it.
- *(my call)* The 30 per day cap lives in the upsert condition and not in a check constraint, so changing it needs no migration.
- *(my call)* No audit table. Nothing here touches money or access control, no legal regime is named in the scope, and logging deletions would add personal data. Spec 17 can revisit.

## Cross check (2026-11-08)

A read only review by a different model found gaps in decision completeness and soundness. You chose to apply every recommended fix. What changed:
- Advisory lock per user and movie, so rating, watchlist add, and swipe cannot leave a movie in two states.
- Exact vector queries for now, because an HNSW index with a filter returns too few rows; the index stays in the schema for later.
- `profiles.country_source`, plus terms acceptance columns for the sign up consent line.
- A defined `UserExport` shape, an opaque cursor with full precision, and a defined full text expression with `coalesce`.
- Import now clears the watchlist and skips, takes `rated_at` from the CSV, and has defined values for a failed run.
- Account deletion goes through Better Auth's `deleteUser` flow so the session ends, and `verification` cleanup matches on `value` as well as the email. This one comes from the reviewer's reading of Better Auth and is marked in Follow-up to verify at build.
- `movie_titles` holds a `primary` row so lookup is one join; a not seen swipe on a rated movie does nothing; the deck hides watchlisted movies and the feed keeps them.

Known fact checked during the interview (2026-11-08): Voyage's docs list output sizes of 256, 512, 1024 (default), and 2048 for the model family, so 1024 is available and also fits pgvector's HNSW limit. Voyage's pricing page and FAQ disagree about which models get free tokens, so the allowance must be re checked at build (noted in Follow-up).

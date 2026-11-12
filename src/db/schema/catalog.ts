import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

/** Postgres full text search document. Only ever read through its generated column. */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const movieTitleKind = pgEnum("movie_title_kind", [
  "primary",
  "original",
  "alternate",
]);

export const creditRole = pgEnum("credit_role", ["cast", "director"]);

/** Embedding size, fixed by spec 0002. A different size means a new table. */
export const EMBEDDING_DIMENSIONS = 1024;

export const movies = pgTable(
  "movies",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    titleNormalized: text("title_normalized").notNull(),
    // A plain date, not a timestamp, so the generated year below is immutable.
    releaseDate: date("release_date", { mode: "string" }),
    releaseYear: smallint("release_year").generatedAlwaysAs(
      sql`extract(year from release_date)::smallint`,
    ),
    overview: text("overview"),
    tagline: text("tagline"),
    runtimeMinutes: integer("runtime_minutes"),
    posterPath: text("poster_path"),
    originalLanguage: text("original_language"),
    popularity: real("popularity"),
    voteAverage: real("vote_average"),
    voteCount: integer("vote_count"),
    fetchedAt: timestamptz("fetched_at"),
    // Set when TMDB no longer returns the movie. The row stays so user ratings
    // and lists still work (spec 0003). Null means the movie is live.
    sourceMissingAt: timestamptz("source_missing_at"),
    // Title matches (weight A) rank above overview matches (weight B).
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(overview, '')), 'B')`,
    ),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("movies_title_normalized_year_idx").on(
      t.titleNormalized,
      t.releaseYear,
    ),
    index("movies_search_idx").using("gin", t.search),
    index("movies_popularity_idx").on(t.popularity.desc()),
  ],
);

export const movieTitles = pgTable(
  "movie_titles",
  {
    movieId: bigint("movie_id", { mode: "number" })
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    titleNormalized: text("title_normalized").notNull(),
    // Every movie has a `primary` row, so a title lookup is one join.
    kind: movieTitleKind("kind").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.movieId, t.titleNormalized] }),
    index("movie_titles_title_normalized_idx").on(t.titleNormalized),
  ],
);

export const movieExternalIds = pgTable(
  "movie_external_ids",
  {
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    movieId: bigint("movie_id", { mode: "number" })
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.externalId] }),
    unique("movie_external_ids_movie_provider_unique").on(
      t.movieId,
      t.provider,
    ),
  ],
);

export const genres = pgTable("genres", {
  id: smallint("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
});

export const movieGenres = pgTable(
  "movie_genres",
  {
    movieId: bigint("movie_id", { mode: "number" })
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    genreId: smallint("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.movieId, t.genreId] }),
    index("movie_genres_genre_movie_idx").on(t.genreId, t.movieId),
  ],
);

export const people = pgTable(
  "people",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    // The TMDB person id, so one person row is reused across movies.
    tmdbId: integer("tmdb_id"),
    name: text("name").notNull(),
    profilePath: text("profile_path"),
  },
  (t) => [uniqueIndex("people_tmdb_id_idx").on(t.tmdbId)],
);

export const credits = pgTable(
  "credits",
  {
    movieId: bigint("movie_id", { mode: "number" })
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    personId: bigint("person_id", { mode: "number" })
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: creditRole("role").notNull(),
    billingOrder: integer("billing_order"),
    characterName: text("character_name"),
  },
  (t) => [
    primaryKey({ columns: [t.movieId, t.personId, t.role] }),
    index("credits_person_idx").on(t.personId),
  ],
);

export const movieEmbeddings = pgTable(
  "movie_embeddings",
  {
    movieId: bigint("movie_id", { mode: "number" })
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),
    embedding: vector("embedding", {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),
    textHash: text("text_hash").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.movieId, t.model] }),
    check(
      "movie_embeddings_dimensions_check",
      sql`${t.dimensions} = ${sql.raw(String(EMBEDDING_DIMENSIONS))}`,
    ),
    // Kept for later growth. Today queries are exact scans (spec 0002).
    index("movie_embeddings_embedding_hnsw_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

/**
 * One stored offer: a service carrying the movie in one country (spec 0013).
 * `free` and `ads` are kept apart here and merged only for display.
 */
export type WatchOfferType = "flatrate" | "free" | "ads" | "rent" | "buy";
export type StoredWatchOffer = {
  type: WatchOfferType;
  providerId: number;
  name: string;
  logoPath: string | null;
  priority: number;
};
export type StoredWatchRegion = {
  link: string | null;
  offers: StoredWatchOffer[];
};

/**
 * Where to watch, cached per movie for every country TMDB returned (spec 0013,
 * AC-7, AC-11). Catalog data, not user data: it is not in the export and goes
 * with its movie. `regions` is parsed with Zod on read.
 */
export const watchAvailability = pgTable("watch_availability", {
  movieId: bigint("movie_id", { mode: "number" })
    .primaryKey()
    .references(() => movies.id, { onDelete: "cascade" }),
  regions: jsonb("regions")
    .$type<Record<string, StoredWatchRegion>>()
    .notNull(),
  fetchedAt: timestamptz("fetched_at").notNull(),
});

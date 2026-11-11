import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "../auth-schema";
import { movies } from "./catalog";

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

/** Every `user_id` is text, references `user.id`, and cascades on delete. */
const userId = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

const movieId = () =>
  bigint("movie_id", { mode: "number" })
    .notNull()
    .references(() => movies.id, { onDelete: "restrict" });

export const ratingSource = pgEnum("rating_source", [
  "swipe",
  "import",
  "manual",
]);

export const countrySource = pgEnum("country_source", ["ip", "user"]);

export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    country: char("country", { length: 2 }),
    countrySource: countrySource("country_source"),
    onboardedAt: timestamptz("onboarded_at"),
    termsAcceptedAt: timestamptz("terms_accepted_at"),
    termsVersion: text("terms_version"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (t) => [
    check("profiles_country_upper_check", sql`${t.country} ~ '^[A-Z]{2}$'`),
    check(
      "profiles_country_source_check",
      sql`(${t.country} is null) = (${t.countrySource} is null)`,
    ),
  ],
);

export const ratings = pgTable(
  "ratings",
  {
    userId: userId(),
    movieId: movieId(),
    score: smallint("score").notNull(),
    source: ratingSource("source").notNull(),
    ratedAt: timestamptz("rated_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.movieId] }),
    check("ratings_score_check", sql`${t.score} between 1 and 10`),
    // Nulls first so a plain `ORDER BY ... DESC` (which is nulls first) can use it.
    index("ratings_user_updated_idx").on(
      t.userId,
      t.updatedAt.desc().nullsFirst(),
      t.movieId.desc().nullsFirst(),
    ),
    index("ratings_movie_idx").on(t.movieId),
  ],
);

/** A movie saved to watch later. A matching rating removes this row. */
export const watchlistEntries = pgTable(
  "watchlist_entries",
  {
    userId: userId(),
    movieId: movieId(),
    addedAt: timestamptz("added_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.movieId] }),
    index("watchlist_user_added_idx").on(
      t.userId,
      t.addedAt.desc().nullsFirst(),
      t.movieId.desc().nullsFirst(),
    ),
  ],
);

export const swipeSkips = pgTable(
  "swipe_skips",
  {
    userId: userId(),
    movieId: movieId(),
    skippedAt: timestamptz("skipped_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.movieId] })],
);

export const importStatus = pgEnum("import_status", ["completed", "failed"]);

/** Why a row of a Letterboxd file did not become a rating (spec 0009). */
export const importUnmatchedReason = pgEnum("import_unmatched_reason", [
  "no_match",
  "ambiguous",
  "invalid_row",
  "duplicate",
  "kept_manual",
]);

/**
 * One saved Letterboxd import (spec 0009). A row is written once, as `completed`
 * inside the transaction that saves the ratings, or as `failed` after that
 * transaction rolled back. A user keeps their latest five.
 */
export const imports = pgTable(
  "imports",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: userId(),
    status: importStatus("status").notNull(),
    rowsTotal: integer("rows_total").notNull(),
    rowsMatched: integer("rows_matched").notNull(),
    rowsUnmatched: integer("rows_unmatched").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    completedAt: timestamptz("completed_at"),
  },
  (t) => [
    check(
      "imports_counts_check",
      sql`${t.rowsTotal} >= 0 and ${t.rowsMatched} >= 0 and ${t.rowsUnmatched} >= 0`,
    ),
    check(
      "imports_completed_counts_check",
      sql`${t.status} <> 'completed' or ${t.rowsMatched} + ${t.rowsUnmatched} = ${t.rowsTotal}`,
    ),
    // Nulls first so a plain `ORDER BY ... DESC` (which is nulls first) can use it.
    index("imports_user_created_idx").on(
      t.userId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
  ],
);

/** The rows of an import that did not become a rating. Reaches the user through `imports`. */
export const importUnmatchedRows = pgTable(
  "import_unmatched_rows",
  {
    importId: bigint("import_id", { mode: "number" })
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    /** The data row's position in the file; the first data row is 1. */
    rowNumber: integer("row_number").notNull(),
    /** Cut to 200 characters; an empty string for a row with a blank title. */
    title: text("title").notNull(),
    year: smallint("year"),
    /** Letterboxd stars times 2, or null when the row had no valid rating. */
    score: smallint("score"),
    reason: importUnmatchedReason("reason").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.importId, t.rowNumber] }),
    check("import_unmatched_rows_row_number_check", sql`${t.rowNumber} >= 1`),
    check(
      "import_unmatched_rows_score_check",
      sql`${t.score} is null or ${t.score} between 1 and 10`,
    ),
  ],
);

/** What a user told the feed about one movie (spec 0011). */
export const feedbackKind = pgEnum("feedback_kind", [
  "not_interested",
  "more_like_this",
]);

/**
 * One feedback row per user and movie (spec 0002, AC-6; spec 0011). `not_interested`
 * hides the movie from the feed and the deck; `more_like_this` makes it an extra
 * liked anchor. `created_at` is reset only when the kind changes.
 */
export const feedFeedback = pgTable(
  "feed_feedback",
  {
    userId: userId(),
    movieId: movieId(),
    kind: feedbackKind("kind").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.movieId] }),
    // Nulls first so a plain `ORDER BY ... DESC` (which is nulls first) can use it.
    index("feed_feedback_user_kind_created_idx").on(
      t.userId,
      t.kind,
      t.createdAt.desc().nullsFirst(),
    ),
  ],
);

import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  index,
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

export const swipeSkips = pgTable(
  "swipe_skips",
  {
    userId: userId(),
    movieId: movieId(),
    skippedAt: timestamptz("skipped_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.movieId] })],
);

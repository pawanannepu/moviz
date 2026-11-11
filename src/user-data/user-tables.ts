import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

/**
 * Tables that have a `user_id` column on purpose but are not part of the user's
 * export: Better Auth owns them and the export must never carry tokens or hashes.
 * They are still removed with the user by cascade.
 */
export const AUTH_TABLES_OUTSIDE_EXPORT = ["session", "account"] as const;

/**
 * Which export key carries each user owned table, by table name. Every feature
 * that adds a table with a `user_id` column adds a line here in the same change,
 * and extends `exportUserData` and `deleteAccount`. A table missing from here
 * fails the completeness test (`/test`) until it is wired in.
 */
export const EXPORT_KEY_BY_TABLE = {
  profiles: "profile",
  ratings: "ratings",
  swipe_skips: "skips",
  // `import_unmatched_rows` has no `user_id`; it rides inside each import (spec 0009).
  imports: "imports",
  watchlist_entries: "watchlist",
  feed_feedback: "feedback",
} as const;

/** Every table in the Drizzle schema that has a `user_id` column. */
export function listTablesWithUserId(): { name: string; table: PgTable }[] {
  return Object.values(schema).flatMap((value) => {
    if (typeof value !== "object" || value === null || !("getSQL" in value)) {
      return [];
    }
    try {
      const config = getTableConfig(value as PgTable);
      return config.columns.some((column) => column.name === "user_id")
        ? [{ name: config.name, table: value as PgTable }]
        : [];
    } catch {
      return [];
    }
  });
}

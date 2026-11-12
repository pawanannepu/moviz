import { type SQL, sql } from "drizzle-orm";
import { movies } from "@/db/schema";
import type { PhraseFilters } from "./types";

/**
 * The word rule filters as one `WHERE` fragment over `movies` (spec 0012,
 * AC-4). A movie with no runtime is left out when a runtime filter is on, and a
 * movie with no release year when a year filter is on (a comparison with null
 * is never true). With no filter it is `true`.
 */
export function filtersSql(filters: PhraseFilters): SQL {
  const parts: SQL[] = [];
  if (filters.runtimeMax !== undefined) {
    parts.push(sql`${movies.runtimeMinutes} <= ${filters.runtimeMax}::int`);
  }
  if (filters.runtimeMin !== undefined) {
    parts.push(sql`${movies.runtimeMinutes} >= ${filters.runtimeMin}::int`);
  }
  if (filters.yearFrom !== undefined) {
    parts.push(sql`${movies.releaseYear} >= ${filters.yearFrom}::int`);
  }
  if (filters.yearTo !== undefined) {
    parts.push(sql`${movies.releaseYear} <= ${filters.yearTo}::int`);
  }
  return parts.length === 0 ? sql`true` : sql`(${sql.join(parts, sql` and `)})`;
}

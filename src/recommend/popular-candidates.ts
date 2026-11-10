import { and, asc, notInArray, sql } from "drizzle-orm";
import { isListable } from "@/catalog/listable";
import type { Executor } from "@/db/create-db";
import { movies } from "@/db/schema";
import { unavailableMovies } from "@/user-data/exclusions";

/**
 * The popular fallback (AC-8, AC-18): listable, available movies not in
 * `shown`, most voted first. `NULLS LAST` is written out because Postgres puts
 * nulls first on a descending sort. Ties go to the lower movie id. A movie
 * without an embedding is allowed here. Returns movie ids in order.
 */
export async function popularCandidates(
  executor: Executor,
  input: { userId: string; shown: readonly number[]; limit: number },
): Promise<number[]> {
  const rows = await executor
    .select({ id: movies.id })
    .from(movies)
    .where(
      and(
        isListable(),
        unavailableMovies(input.userId, movies.id, "feed"),
        input.shown.length > 0
          ? notInArray(movies.id, [...input.shown])
          : undefined,
      ),
    )
    .orderBy(sql`${movies.voteCount} desc nulls last`, asc(movies.id))
    .limit(input.limit);
  return rows.map((row) => row.id);
}

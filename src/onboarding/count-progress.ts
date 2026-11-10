import { sql } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import { type DbUnavailable, toDbFailure } from "@/db/failure";
import { ratings, swipeSkips } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

export type Progress = {
  /** All of the user's ratings, whatever their source. */
  rated: number;
  /** The user's skips plus their ratings with source `swipe`. */
  shown: number;
};

/**
 * Counts one user's `rated` and `shown` in a single query (spec 0006, Feature
 * design). Nothing is stored: the counters come from the rows every time, so a
 * second tab or a returning visit always sees the truth.
 */
export async function countProgress(
  db: Db,
  input: { userId: string },
): Promise<Result<Progress, DbUnavailable>> {
  const { userId } = input;
  try {
    const result = await db.execute<{
      rated: number;
      swiped: number;
      skipped: number;
    }>(sql`
      select
        (select count(*)::int from ${ratings} where ${ratings.userId} = ${userId}::text) as rated,
        (select count(*)::int from ${ratings} where ${ratings.userId} = ${userId}::text and ${ratings.source} = 'swipe') as swiped,
        (select count(*)::int from ${swipeSkips} where ${swipeSkips.userId} = ${userId}::text) as skipped
    `);
    const row = result.rows[0];
    return ok({ rated: row.rated, shown: row.swiped + row.skipped });
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }
}

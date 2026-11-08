import { sql } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import { type DbUnavailable, toDbFailure } from "@/db/failure";
import { people } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import { lockAllMovieWrites } from "./locks";

/**
 * Deletes people who no longer have any credit (spec 0003, AC-19). The seed and
 * the cron job call it once at the end of a run. It first waits for every movie
 * write in flight, so a person whose credit is being written right now is never
 * deleted. Returns how many people were removed.
 */
export async function deleteOrphanPeople(
  db: Db,
): Promise<Result<{ deleted: number }, DbUnavailable>> {
  try {
    const deleted = await db.transaction(async (tx) => {
      await lockAllMovieWrites(tx);
      const rows = await tx
        .delete(people)
        .where(
          sql`not exists (select 1 from credits where credits.person_id = ${people.id})`,
        )
        .returning({ id: people.id });
      return rows.length;
    });
    return ok({ deleted });
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }
}

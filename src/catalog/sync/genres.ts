import type { Db } from "@/db/create-db";
import { type DbUnavailable, toDbFailure } from "@/db/failure";
import { genres } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

/**
 * Creates any genre name that is not stored yet (spec 0003, seed step 1).
 * Existing genres are left alone, so ids stay stable. Names are written in
 * sorted order.
 */
export async function upsertGenres(
  db: Db,
  names: string[],
): Promise<Result<void, DbUnavailable>> {
  const unique = [...new Set(names)].sort();
  if (unique.length === 0) return ok(undefined);
  try {
    await db
      .insert(genres)
      .values(unique.map((name) => ({ name })))
      .onConflictDoNothing({ target: genres.name });
    return ok(undefined);
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }
}

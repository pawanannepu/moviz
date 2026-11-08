import { sql } from "drizzle-orm";
import type { Tx } from "@/db/create-db";

/** Fixed key for the catalog wide lock. Test migrations use 727272001. */
const ALL_CATALOG_WRITES_KEY = 727_272_002;

/**
 * Called first by every movie write (spec 0003, AC-18). Takes two transaction
 * scoped locks, released at commit or rollback, that work through Neon's
 * transaction pooling:
 *
 * 1. A shared lock on all catalog writes, so `deleteOrphanPeople` can wait for
 *    writes in flight and never delete a person whose credit is about to land.
 * 2. An exclusive lock for this one TMDB id, so two runs cannot write the same
 *    movie at once.
 */
export async function lockMovieWrite(tx: Tx, tmdbId: number): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock_shared(${ALL_CATALOG_WRITES_KEY}::bigint)`,
  );
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('tmdb:' || ${tmdbId}::text, 0))`,
  );
}

/** Waits for every movie write in flight, then blocks new ones until commit. */
export async function lockAllMovieWrites(tx: Tx): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${ALL_CATALOG_WRITES_KEY}::bigint)`,
  );
}

import { sql } from "drizzle-orm";
import type { Tx } from "./create-db";

/** The one key both import lock modes use, so they conflict with each other. */
const importKey = (userId: string) =>
  sql`hashtextextended('import:' || ${userId}::text, 0)`;

/**
 * Takes the exclusive per user import lock (spec 0009, AC-9, AC-17). A user's
 * imports run one at a time, and the import waits for that user's rating writes
 * already in flight (they hold the shared mode). Released at commit or rollback.
 */
export async function lockUserImport(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${importKey(userId)})`);
}

/**
 * Takes the shared per user import lock. Every write to a user's ratings, skips
 * or watchlist calls it before `lockUserMovie`, so none of them can commit in the
 * middle of an import. Shared locks do not block each other, so a user's swipes
 * only wait while that same user's import runs. Always take this one first, then
 * the per movie lock.
 */
export async function lockUserImportShared(
  tx: Tx,
  userId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock_shared(${importKey(userId)})`,
  );
}

/**
 * Takes a transaction scoped lock for one (user, movie) pair. Rating, watchlist
 * and swipe writes call it first, so two parallel requests cannot each miss the
 * other's uncommitted row and leave a movie both rated and skipped (or rated and
 * watchlisted). Released automatically at commit or rollback. It works through
 * Neon's transaction pooling because it is `xact` scoped. Call
 * `lockUserImportShared` first (spec 0009).
 */
export async function lockUserMovie(
  tx: Tx,
  userId: string,
  movieId: number,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${userId}::text || ':' || ${movieId}::text, 0))`,
  );
}

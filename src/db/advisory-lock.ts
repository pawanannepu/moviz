import { sql } from "drizzle-orm";
import type { Tx } from "./create-db";

/**
 * Takes a transaction scoped lock for one (user, movie) pair. Rating, watchlist
 * and swipe writes call it first, so two parallel requests cannot each miss the
 * other's uncommitted row and leave a movie both rated and skipped (or rated and
 * watchlisted). Released automatically at commit or rollback. It works through
 * Neon's transaction pooling because it is `xact` scoped.
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

import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import { type DbUnavailable, toDbFailure } from "@/db/failure";
import { movieExternalIds, movies } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

/**
 * Small read queries the seed and the cron job share. Each maps a lost database
 * connection to `db_unavailable` and rethrows anything else (a bug).
 */

async function guarded<T>(
  run: () => Promise<T>,
): Promise<Result<T, DbUnavailable>> {
  try {
    return ok(await run());
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }
}

/** How many stored movies TMDB still returns (`source_missing_at` is null). */
export function countLiveMovies(
  db: Db,
): Promise<Result<number, DbUnavailable>> {
  return guarded(async () => {
    const [row] = await db
      .select({ total: count() })
      .from(movies)
      .where(isNull(movies.sourceMissingAt));
    return row?.total ?? 0;
  });
}

export type StoredState = "live" | "removed";

/**
 * Which of these TMDB ids are stored, and whether each is live or removed. Ids
 * with no stored movie are absent from the map. One query.
 */
export function findStoredByTmdbIds(
  db: Db,
  tmdbIds: number[],
): Promise<Result<Map<number, StoredState>, DbUnavailable>> {
  return guarded(async () => {
    const states = new Map<number, StoredState>();
    if (tmdbIds.length === 0) return states;
    const rows = await db
      .select({
        externalId: movieExternalIds.externalId,
        sourceMissingAt: movies.sourceMissingAt,
      })
      .from(movieExternalIds)
      .innerJoin(movies, eq(movies.id, movieExternalIds.movieId))
      .where(
        and(
          eq(movieExternalIds.provider, "tmdb"),
          inArray(
            movieExternalIds.externalId,
            tmdbIds.map((id) => String(id)),
          ),
        ),
      );
    for (const row of rows) {
      states.set(
        Number(row.externalId),
        row.sourceMissingAt === null ? "live" : "removed",
      );
    }
    return states;
  });
}

/**
 * Whole days since the oldest `fetched_at` among movies not marked removed (AC-11).
 * Removed movies are left out on purpose. Null when no such movie has a
 * `fetched_at`.
 */
export function oldestAgeDays(
  db: Db,
): Promise<Result<number | null, DbUnavailable>> {
  return guarded(async () => {
    const [row] = await db
      .select({
        days: sql<
          number | null
        >`floor(extract(epoch from (now() - min(${movies.fetchedAt}))) / 86400)::int`,
      })
      .from(movies)
      .where(isNull(movies.sourceMissingAt));
    return row?.days ?? null;
  });
}

/**
 * Groups of TMDB ids that share a title key and release year among live movies,
 * so you can spot a film TMDB lists twice. The matcher returns `ambiguous` for
 * these rather than guessing (spec 0003, Failure handling).
 */
export function findDuplicateTitleGroups(
  db: Db,
): Promise<Result<number[][], DbUnavailable>> {
  return guarded(async () => {
    const result = await db.execute<{ ids: string[] }>(sql`
      select array_agg(e.external_id order by e.external_id) as ids
      from ${movies} m
      join ${movieExternalIds} e on e.movie_id = m.id and e.provider = 'tmdb'
      where m.source_missing_at is null
      group by m.title_normalized, m.release_year
      having count(*) > 1
      order by min(m.id)
    `);
    return result.rows.map((row) => row.ids.map((id) => Number(id)));
  });
}

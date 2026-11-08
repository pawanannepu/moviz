import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { TmdbError } from "@/catalog/tmdb/client";
import { type DbUnavailable, toDbFailure } from "@/db/failure";
import { movieExternalIds, movies } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import { mapDetails } from "./map-details";
import { markMovieRemoved } from "./mark-removed";
import { type PersistError, persistMovie } from "./persist-movie";
import type { RunSummary } from "./run-summary";
import type { SyncDeps, SyncError } from "./sync-movie";
import { type AbortCode, tallySyncResult } from "./tally";

/** Movies the daily job refreshes per run (spec 0003, AC-10). */
export const REFRESH_LIMIT = 100;
/** TMDB detail calls in flight at once. */
const CONCURRENCY = 5;

export type RefreshDeps = SyncDeps & {
  /** Replaceable for tests. Milliseconds since the epoch. */
  now?: () => number;
};

/**
 * TMDB ids of the movies to refresh, oldest first (AC-11): movies TMDB still
 * returns (`source_missing_at` is null), whether listable or not, ordered by
 * `fetched_at` ascending with never fetched rows first.
 */
export async function pickMoviesToRefresh(
  db: SyncDeps["db"],
  limit: number,
): Promise<Result<number[], DbUnavailable>> {
  try {
    const rows = await db
      .select({ externalId: movieExternalIds.externalId })
      .from(movies)
      .innerJoin(movieExternalIds, eq(movieExternalIds.movieId, movies.id))
      .where(
        and(
          eq(movieExternalIds.provider, "tmdb"),
          isNull(movies.sourceMissingAt),
        ),
      )
      .orderBy(sql`${movies.fetchedAt} asc nulls first`, asc(movies.id))
      .limit(limit);
    return ok(rows.map((row) => Number(row.externalId)));
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }
}

type RefreshOutcome = { kind: "updated" } | { kind: "removed" };

/**
 * Refreshes one stored movie from TMDB. A TMDB "not found", or an adult flag,
 * marks the movie removed (AC-12). Otherwise it is rewritten through the shared
 * write path, which sets `fetched_at`. The vote and date floors are not applied
 * to a movie already in the catalog, and a movie whose poster went null stays in
 * the rotation.
 */
async function refreshMovie(
  deps: RefreshDeps,
  tmdbId: number,
): Promise<Result<RefreshOutcome, TmdbError | PersistError>> {
  const details = await deps.tmdb.getMovieDetails(tmdbId, {
    deadline: deps.deadline,
  });
  if (!details.ok) {
    if (details.error.code !== "tmdb_not_found") return err(details.error);
    const marked = await markMovieRemoved(deps.db, tmdbId);
    return marked.ok ? ok({ kind: "removed" }) : err(marked.error);
  }

  const movie = mapDetails(details.value);
  if (movie.adult) {
    const marked = await markMovieRemoved(deps.db, tmdbId);
    return marked.ok ? ok({ kind: "removed" }) : err(marked.error);
  }
  const persisted = await persistMovie(deps.db, movie);
  return persisted.ok ? ok({ kind: "updated" }) : err(persisted.error);
}

/**
 * The refresh step of the daily job (spec 0003, Cron job step 1). Refreshes up to
 * `limit` of the oldest movies, 5 at a time, and stops starting new work once
 * `deps.deadline` has passed; the next run continues where this one stopped.
 * Returns the summary with this step's counts added, or an abort code (bad TMDB
 * token, lost database).
 */
export async function refreshMovies(
  deps: RefreshDeps,
  summary: RunSummary,
  limit: number = REFRESH_LIMIT,
): Promise<Result<RunSummary, { code: AbortCode; summary: RunSummary }>> {
  const now = deps.now ?? Date.now;
  let current = summary;

  const picked = await pickMoviesToRefresh(deps.db, limit);
  if (!picked.ok) return err({ code: "db_unavailable", summary: current });

  for (let start = 0; start < picked.value.length; start += CONCURRENCY) {
    if (deps.deadline !== undefined && now() >= deps.deadline) break;
    const chunk = picked.value.slice(start, start + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((tmdbId) => refreshMovie(deps, tmdbId)),
    );
    for (const result of results) {
      if (result.ok) {
        current =
          result.value.kind === "removed"
            ? { ...current, removed: current.removed + 1 }
            : { ...current, updated: current.updated + 1 };
        continue;
      }
      const failed: Result<never, SyncError> = err(result.error);
      const tallied = tallySyncResult(current, failed);
      current = tallied.summary;
      if (tallied.abort) return err({ code: tallied.abort, summary: current });
    }
  }
  return ok(current);
}

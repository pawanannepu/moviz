import { discoverMovies } from "@/catalog/tmdb/discover";
import { err, ok, type Result } from "@/lib/result";
import { findStoredByTmdbIds } from "./catalog-state";
import type { RefreshDeps } from "./refresh";
import type { RunSummary } from "./run-summary";
import { syncMovie } from "./sync-movie";
import { type AbortCode, tallySyncResult } from "./tally";

/** New movies the daily job adds per run (spec 0003, AC-10). */
export const NEW_HIT_LIMIT = 20;
/** Discover pages read for new hits. */
const NEW_HIT_PAGES = 3;
/** A new hit was released within this many days. */
const NEW_HIT_WINDOW_DAYS = 365;
const MIN_VOTES = 500;
const CONCURRENCY = 5;

/** `YYYY-MM-DD` for `days` days before a `YYYY-MM-DD` date, in UTC. */
export function daysBefore(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * The new hit step of the daily job (spec 0003, Cron job step 2). Reads three
 * discover pages sorted by popularity, limited to movies released in the last 365
 * days with at least 500 votes, and adds up to 20 movies that are not stored yet
 * and pass the eligibility rules. A movie already stored, removed ones included,
 * is never touched here, so a removed movie stays removed.
 */
export async function addNewHits(
  deps: RefreshDeps,
  summary: RunSummary,
  limit: number = NEW_HIT_LIMIT,
): Promise<Result<RunSummary, { code: AbortCode; summary: RunSummary }>> {
  const now = deps.now ?? Date.now;
  const timeUp = () => deps.deadline !== undefined && now() >= deps.deadline;
  let current = summary;
  let added = 0;
  const seen = new Set<number>();

  for (let page = 1; page <= NEW_HIT_PAGES && added < limit; page++) {
    if (timeUp()) break;
    const discovered = await discoverMovies(
      deps.tmdb,
      {
        sortBy: "popularity.desc",
        page,
        minVotes: MIN_VOTES,
        releasedOnOrAfter: daysBefore(deps.today, NEW_HIT_WINDOW_DAYS),
        releasedOnOrBefore: deps.today,
      },
      { deadline: deps.deadline },
    );
    if (!discovered.ok) {
      if (discovered.error.code === "tmdb_unauthorized") {
        return err({ code: "tmdb_unauthorized", summary: current });
      }
      // A discover page that fails is skipped. The next run tries again.
      current = { ...current, failed: current.failed + 1 };
      continue;
    }
    const ids = discovered.value.ids.filter((id) => !seen.has(id));
    for (const id of ids) seen.add(id);

    const stored = await findStoredByTmdbIds(deps.db, ids);
    if (!stored.ok) return err({ code: "db_unavailable", summary: current });
    const fresh = ids.filter((id) => !stored.value.has(id));

    for (let start = 0; start < fresh.length && added < limit; ) {
      if (timeUp()) break;
      // Never fetch more at once than the limit still has room for.
      const size = Math.min(CONCURRENCY, limit - added);
      const chunk = fresh.slice(start, start + size);
      start += chunk.length;
      const results = await Promise.all(
        chunk.map((tmdbId) => syncMovie(deps, tmdbId)),
      );
      for (const result of results) {
        const tallied = tallySyncResult(current, result);
        current = tallied.summary;
        if (tallied.abort)
          return err({ code: tallied.abort, summary: current });
        if (tallied.counted) added++;
      }
    }
  }
  return ok(current);
}

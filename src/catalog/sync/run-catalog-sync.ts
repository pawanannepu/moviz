import { embedMovies } from "@/catalog/embedding/embed-movies";
import type { VoyageClient } from "@/catalog/embedding/voyage-client";
import { err, ok, type Result } from "@/lib/result";
import { addNewHits } from "./add-new-hits";
import { oldestAgeDays } from "./catalog-state";
import { deleteOrphanPeople } from "./orphan-people";
import { refreshMovies } from "./refresh";
import { emptyRunSummary, type RunSummary } from "./run-summary";
import type { SyncDeps } from "./sync-movie";
import type { AbortCode } from "./tally";

/** The job stops starting new work this long after it begins (AC-10). */
export const TIME_BUDGET_MS = 45_000;
/** Movies embedded per run (AC-10). */
export const EMBED_LIMIT = 100;
/** A warning is logged when the oldest row is older than this many days (AC-11). */
export const STALE_WARNING_DAYS = 120;

export type CatalogSyncDeps = Omit<SyncDeps, "deadline"> & {
  voyage: VoyageClient;
  /** Replaceable for tests. Milliseconds since the epoch. */
  now?: () => number;
  /** Replaceable for tests. Receives one JSON line, counts and ids only. */
  log?: (line: string) => void;
  warn?: (line: string) => void;
};

export type CatalogSyncFailure = { code: AbortCode; summary: RunSummary };

/**
 * The daily catalog job (spec 0003, Cron job): refresh the oldest 100 movies, add
 * up to 20 new hits, embed new and changed movies (at most 100), delete people
 * with no credits, and report. No new work starts after 45 seconds; work is
 * ordered by `fetched_at`, so the next run continues where this one stopped.
 *
 * A bad TMDB token or a lost database stops the run with a `CatalogSyncFailure`.
 * Voyage trouble does not: unembedded movies wait for the next run. The log line
 * and the summary carry counts only, never a key or a rating.
 */
export async function runCatalogSync(
  deps: CatalogSyncDeps,
): Promise<Result<RunSummary, CatalogSyncFailure>> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? console.log;
  const warn = deps.warn ?? console.warn;
  const deadline = now() + TIME_BUDGET_MS;
  const syncDeps = { ...deps, deadline };

  const refreshed = await refreshMovies(syncDeps, emptyRunSummary());
  if (!refreshed.ok) return err(refreshed.error);

  const withHits = await addNewHits(syncDeps, refreshed.value);
  if (!withHits.ok) return err(withHits.error);
  let summary = withHits.value;

  const embedded = await embedMovies(
    { db: deps.db, voyage: deps.voyage, deadline, now },
    { limit: EMBED_LIMIT },
  );
  if (embedded.ok) {
    summary = { ...summary, embedded: embedded.value.embedded };
  } else if (embedded.error.code === "db_unavailable") {
    return err({ code: "db_unavailable", summary });
  } else {
    // Voyage is down or refused: keep what was saved and carry on.
    summary = { ...summary, embedded: embedded.error.progress.embedded };
    warn(`catalog sync: embedding stopped (${embedded.error.code})`);
  }

  const orphans = await deleteOrphanPeople(deps.db);
  const oldest = await oldestAgeDays(deps.db);
  if (!orphans.ok || !oldest.ok) {
    return err({ code: "db_unavailable", summary });
  }
  summary = { ...summary, oldestAgeDays: oldest.value };

  if (oldest.value !== null && oldest.value > STALE_WARNING_DAYS) {
    warn(
      `catalog sync: oldest movie is ${oldest.value} days old (limit ${STALE_WARNING_DAYS})`,
    );
  }
  log(JSON.stringify({ event: "catalog_sync", ...summary }));
  return ok(summary);
}

import {
  discoverMovies,
  getGenreNames,
  MAX_DISCOVER_PAGE,
} from "@/catalog/tmdb/discover";
import { err, ok, type Result } from "@/lib/result";
import {
  countLiveMovies,
  findDuplicateTitleGroups,
  findStoredByTmdbIds,
  oldestAgeDays,
} from "./catalog-state";
import { upsertGenres } from "./genres";
import { markMovieRemoved } from "./mark-removed";
import { deleteOrphanPeople } from "./orphan-people";
import { emptyRunSummary, type RunSummary } from "./run-summary";
import { type SyncDeps, syncMovie } from "./sync-movie";
import { type AbortCode, tallySyncResult } from "./tally";

/** How many movies a seed run aims for unless told otherwise (AC-1). */
export const DEFAULT_TARGET = 3000;
/** TMDB detail calls in flight at once. */
export const DEFAULT_CONCURRENCY = 5;
/** A movie needs at least this many votes to be listed by discover (AC-1). */
const DISCOVER_MIN_VOTES = 500;

/** What the seed prints at the end: the run summary plus two seed only fields. */
export type SeedSummary = RunSummary & {
  /** Target minus live movies stored. Zero when the target was reached. */
  shortfall: number;
  /** Groups of TMDB ids that share a title key and release year. */
  duplicateTitleGroups: number[][];
};

export type SeedFailure = {
  code: AbortCode | "tmdb_failed";
  /** What the run had done before it stopped. */
  summary: RunSummary;
};

export type SeedOptions = {
  target: number;
  concurrency?: number;
  /** Called after each discover page, with counts only. */
  onProgress?: (progress: {
    page: number;
    counted: number;
    target: number;
  }) => void;
};

/**
 * Loads the catalog (spec 0003, Seed algorithm). Safe to run again: movies
 * already stored are counted, not fetched, so a re run finishes a stopped run and
 * a finished run makes no detail calls (AC-1, AC-2).
 *
 * The target counts eligible movies in TMDB's vote order, highest first. A movie
 * that fails an eligibility rule is skipped and the next one takes its place.
 * A bad token or a lost database stops the run with a `SeedFailure`; any other
 * trouble with one movie is counted and the run goes on (AC-15).
 */
export async function seedCatalog(
  deps: SyncDeps,
  options: SeedOptions,
): Promise<Result<SeedSummary, SeedFailure>> {
  const { db, tmdb } = deps;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  let summary = emptyRunSummary();
  const fail = (code: SeedFailure["code"]) => err({ code, summary });

  // 1. Genres.
  const genreNames = await getGenreNames(tmdb);
  if (!genreNames.ok) {
    return fail(
      genreNames.error.code === "tmdb_unauthorized"
        ? "tmdb_unauthorized"
        : "tmdb_failed",
    );
  }
  const genresSaved = await upsertGenres(db, genreNames.value);
  if (!genresSaved.ok) return fail("db_unavailable");

  // 2. Already at the target? Stop before any detail call.
  const liveBefore = await countLiveMovies(db);
  if (!liveBefore.ok) return fail("db_unavailable");

  if (liveBefore.value < options.target) {
    // 3 and 4. Walk discover, highest vote count first.
    let counted = 0;
    const seen = new Set<number>();

    for (
      let page = 1;
      counted < options.target && page <= MAX_DISCOVER_PAGE;
      page++
    ) {
      const discovered = await discoverMovies(tmdb, {
        sortBy: "vote_count.desc",
        page,
        minVotes: DISCOVER_MIN_VOTES,
        releasedOnOrBefore: deps.today,
      });
      if (!discovered.ok) {
        return fail(
          discovered.error.code === "tmdb_unauthorized"
            ? "tmdb_unauthorized"
            : "tmdb_failed",
        );
      }
      const ids = discovered.value.ids.filter((id) => !seen.has(id));
      for (const id of ids) seen.add(id);
      if (discovered.value.ids.length === 0) break;

      const stored = await findStoredByTmdbIds(db, ids);
      if (!stored.ok) return fail("db_unavailable");

      let batch: number[] = [];
      const flush = async (): Promise<AbortCode | null> => {
        const current = batch;
        batch = [];
        const results = await Promise.all(
          current.map((id) => syncMovie(deps, id)),
        );
        // Tally in discover order so the counts do not depend on timing.
        for (const result of results) {
          const tallied = tallySyncResult(summary, result);
          summary = tallied.summary;
          if (tallied.abort) return tallied.abort;
          if (tallied.counted) counted++;
        }
        return null;
      };

      for (const id of ids) {
        if (counted >= options.target) break;
        if (stored.value.get(id) === "live") {
          // Keep discover order: settle the movies before it first.
          const aborted = await flush();
          if (aborted) return fail(aborted);
          if (counted < options.target) counted++;
          continue;
        }
        batch.push(id);
        // Never fetch more at once than the target still has room for.
        if (batch.length >= Math.min(concurrency, options.target - counted)) {
          const aborted = await flush();
          if (aborted) return fail(aborted);
        }
      }
      const aborted = await flush();
      if (aborted) return fail(aborted);

      options.onProgress?.({ page, counted, target: options.target });
      if (page >= discovered.value.totalPages) break;
    }
  }

  // 6. Clean up and report.
  return finishRun(deps, summary, options.target);
}

async function finishRun(
  deps: SyncDeps,
  summary: RunSummary,
  target: number,
): Promise<Result<SeedSummary, SeedFailure>> {
  const { db } = deps;
  const orphans = await deleteOrphanPeople(db);
  const live = await countLiveMovies(db);
  const oldest = await oldestAgeDays(db);
  const duplicates = await findDuplicateTitleGroups(db);
  if (!orphans.ok || !live.ok || !oldest.ok || !duplicates.ok) {
    return err({ code: "db_unavailable", summary });
  }
  return ok({
    ...summary,
    oldestAgeDays: oldest.value,
    shortfall: Math.max(0, target - live.value),
    duplicateTitleGroups: duplicates.value,
  });
}

export type ForceSyncOutcome =
  | { kind: "stored" | "updated" }
  /** The movie fails an eligibility rule; the stored row (if any) was left alone. */
  | { kind: "skipped"; reason: keyof RunSummary["skipped"] }
  /** TMDB returned 404 and a stored movie was marked removed. */
  | { kind: "removed" }
  /** TMDB returned 404 and nothing was stored for this id. */
  | { kind: "not_found" };

/**
 * Syncs one TMDB id no matter what state it is in (`pnpm catalog:seed --id`,
 * AC-2). On success it rewrites the movie and clears `source_missing_at`. On a
 * 404 it marks a stored movie removed. A movie that fails an eligibility rule is
 * reported and its row is left alone.
 */
export async function forceSyncMovie(
  deps: SyncDeps,
  tmdbId: number,
): Promise<
  Result<{ outcome: ForceSyncOutcome; summary: RunSummary }, SeedFailure>
> {
  const base = emptyRunSummary();
  const result = await syncMovie(deps, tmdbId);

  if (!result.ok && result.error.code === "tmdb_not_found") {
    const marked = await markMovieRemoved(deps.db, tmdbId);
    if (!marked.ok) return err({ code: "db_unavailable", summary: base });
    if (marked.value.kind === "removed") {
      return ok({
        outcome: { kind: "removed" },
        summary: { ...base, removed: 1 },
      });
    }
    return ok({
      outcome: { kind: "not_found" },
      summary: { ...base, skipped: { ...base.skipped, not_found: 1 } },
    });
  }

  const tallied = tallySyncResult(base, result);
  if (tallied.abort) return err({ code: tallied.abort, summary: base });

  let outcome: ForceSyncOutcome;
  if (result.ok) {
    outcome =
      result.value.kind === "skipped"
        ? { kind: "skipped", reason: result.value.reason }
        : { kind: result.value.created ? "stored" : "updated" };
  } else if (result.error.code === "tmdb_bad_shape") {
    outcome = { kind: "skipped", reason: "bad_shape" };
  } else {
    // TMDB refused or was unreachable: nothing was written.
    return err({ code: "tmdb_failed", summary: tallied.summary });
  }
  const orphans = await deleteOrphanPeople(deps.db);
  if (!orphans.ok) {
    return err({ code: "db_unavailable", summary: tallied.summary });
  }
  return ok({ outcome, summary: tallied.summary });
}

import type { Result } from "@/lib/result";
import type { RunSummary } from "./run-summary";
import type { SyncError, SyncOutcome } from "./sync-movie";

/** A reason to stop the whole run instead of skipping one movie. */
export type AbortCode = "tmdb_unauthorized" | "db_unavailable";

/**
 * Adds one sync result to a summary and returns the summary plus what the run
 * should do next (spec 0003, AC-15). Pure: the input summary is not changed.
 *
 * - stored or rewritten: counted in `stored` or `updated`
 * - failed an eligibility rule, or TMDB had no such movie, or its answer had the
 *   wrong shape: counted under `skipped`, the run goes on
 * - TMDB refused or was unreachable for this one movie: counted in `failed`
 * - a bad token or a lost database: the run must stop (`abort`), because every
 *   later movie would fail the same way
 */
export function tallySyncResult(
  summary: RunSummary,
  result: Result<SyncOutcome, SyncError>,
): { summary: RunSummary; abort: AbortCode | null; counted: boolean } {
  const skip = (reason: keyof RunSummary["skipped"]) => ({
    summary: {
      ...summary,
      skipped: { ...summary.skipped, [reason]: summary.skipped[reason] + 1 },
    },
    abort: null,
    counted: false,
  });

  if (result.ok) {
    const outcome = result.value;
    if (outcome.kind === "skipped") return skip(outcome.reason);
    return {
      summary: outcome.created
        ? { ...summary, stored: summary.stored + 1 }
        : { ...summary, updated: summary.updated + 1 },
      abort: null,
      counted: true,
    };
  }

  switch (result.error.code) {
    case "tmdb_unauthorized":
    case "db_unavailable":
      return { summary, abort: result.error.code, counted: false };
    case "tmdb_not_found":
      return skip("not_found");
    case "tmdb_bad_shape":
      return skip("bad_shape");
    case "empty_title":
      return skip("empty_title");
    case "tmdb_rejected":
    case "tmdb_unavailable":
      return {
        summary: { ...summary, failed: summary.failed + 1 },
        abort: null,
        counted: false,
      };
  }
}

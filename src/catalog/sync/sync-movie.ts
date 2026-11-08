import type { TmdbClient, TmdbError } from "@/catalog/tmdb/client";
import type { Db } from "@/db/create-db";
import { err, ok, type Result } from "@/lib/result";
import { type EligibilityReason, isEligible } from "./eligibility";
import { mapDetails } from "./map-details";
import { type PersistError, persistMovie } from "./persist-movie";

export type SyncDeps = {
  db: Db;
  tmdb: TmdbClient;
  /** UTC date as `YYYY-MM-DD`, used for the release date rule. */
  today: string;
  /** Epoch milliseconds after which no TMDB retry starts. */
  deadline?: number;
};

export type SyncOutcome =
  | { kind: "stored"; movieId: number; created: boolean }
  | { kind: "skipped"; reason: EligibilityReason };

export type SyncError = TmdbError | PersistError;

/**
 * Syncs one movie from TMDB: fetch details, map them, check the eligibility
 * rules, and write. This is the thin thread the seed (and later the cron job)
 * builds on. A movie that fails a rule comes back as `skipped` with the reason,
 * never as an error. TMDB or database trouble comes back as an error.
 */
export async function syncMovie(
  deps: SyncDeps,
  tmdbId: number,
): Promise<Result<SyncOutcome, SyncError>> {
  const details = await deps.tmdb.getMovieDetails(tmdbId, {
    deadline: deps.deadline,
  });
  if (!details.ok) return err(details.error);

  const movie = mapDetails(details.value);
  const eligibility = isEligible(movie, deps.today);
  if (!eligibility.eligible) {
    return ok({ kind: "skipped", reason: eligibility.reason });
  }

  const persisted = await persistMovie(deps.db, movie);
  if (!persisted.ok) return err(persisted.error);
  return ok({ kind: "stored", ...persisted.value });
}

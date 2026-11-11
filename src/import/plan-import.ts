import type { MatchOutcome } from "@/catalog/match/match-movies";
import {
  cutTitle,
  type EvaluatedRow,
  type UnmatchedReason,
  type ValidRow,
} from "./row-rules";

/** A rating the import will try to save. */
export type PlannedRating = {
  rowNumber: number;
  /** Kept so the row can still be stored if the user rated this movie by hand (`kept_manual`). Already cut. */
  title: string;
  year: number;
  movieId: number;
  /** 1 to 10. */
  score: number;
  /** The date from the file at 00:00:00 UTC, or null for the database `now()`. */
  ratedAt: Date | null;
};

/** A row that will be stored as unmatched. `title` is already cut to the stored length. */
export type UnmatchedRow = {
  rowNumber: number;
  title: string;
  year: number | null;
  score: number | null;
  reason: UnmatchedReason;
};

/** What the file asks for, before the database decides anything. */
export type ImportPlan = {
  /** Every data row read. `ratings.length + unmatched.length` always equals it. */
  rowsTotal: number;
  ratings: PlannedRating[];
  unmatched: UnmatchedRow[];
};

/** The rows that go to `matchMovies`, in file order. The outcomes must line up with this list. */
export function rowsToMatch(rows: readonly EvaluatedRow[]): ValidRow[] {
  return rows.filter((row): row is ValidRow => row.kind === "valid");
}

/**
 * Turns evaluated rows and the matcher's answers into a plan (spec 0009, AC-4).
 * `outcomes[i]` is the answer for the i-th row of `rowsToMatch(rows)`.
 *
 * - An invalid row is unmatched with reason `invalid_row`.
 * - `no_match` and `ambiguous` map to the reasons of the same name.
 * - If two rows match the same movie, the first row wins and each later one is
 *   unmatched with reason `duplicate`. This runs before the manual rating check,
 *   so a hand rated movie that appears twice gets `kept_manual` on its first row
 *   and `duplicate` on the rest.
 *
 * Pure. Unmatched rows come back in file order.
 */
export function planImport(
  rows: readonly EvaluatedRow[],
  outcomes: readonly MatchOutcome[],
): ImportPlan {
  const ratings: PlannedRating[] = [];
  const unmatched: UnmatchedRow[] = [];
  const claimed = new Set<number>();
  let nextOutcome = 0;

  for (const row of rows) {
    if (row.kind === "invalid") {
      unmatched.push({
        rowNumber: row.rowNumber,
        title: cutTitle(row.title),
        year: row.year,
        score: row.score,
        reason: "invalid_row",
      });
      continue;
    }
    const outcome = outcomes[nextOutcome++];
    const stored = {
      rowNumber: row.rowNumber,
      title: cutTitle(row.title),
      year: row.year,
      score: row.score,
    };
    if (outcome?.kind !== "match") {
      unmatched.push({
        ...stored,
        reason: outcome?.kind === "ambiguous" ? "ambiguous" : "no_match",
      });
    } else if (claimed.has(outcome.movieId)) {
      unmatched.push({ ...stored, reason: "duplicate" });
    } else {
      claimed.add(outcome.movieId);
      ratings.push({
        rowNumber: row.rowNumber,
        title: stored.title,
        year: row.year,
        movieId: outcome.movieId,
        score: row.score,
        ratedAt: row.ratedAt,
      });
    }
  }

  return { rowsTotal: rows.length, ratings, unmatched };
}

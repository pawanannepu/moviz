import { z } from "zod";

/**
 * Why a movie was left out of the catalog. The first six are the eligibility
 * rules (`isEligible`); `not_found` and `bad_shape` are TMDB answers.
 */
export const SKIP_REASONS = [
  "adult",
  "no_poster",
  "no_overview",
  "future_date",
  "low_votes",
  "empty_title",
  "not_found",
  "bad_shape",
] as const;

export type SkipReason = (typeof SKIP_REASONS)[number];

const count = z.number().int().nonnegative();

/**
 * What every sync run reports (spec 0003, AC-15): returned by the cron route and
 * printed by the scripts. Counts and TMDB ids only, never a token or a rating.
 */
export const runSummarySchema = z.object({
  stored: count,
  updated: count,
  removed: count,
  failed: count,
  embedded: count,
  /** Whole days since the oldest `fetched_at` among movies not marked removed. Null with no movies. */
  oldestAgeDays: count.nullable(),
  skipped: z.object({
    adult: count,
    no_poster: count,
    no_overview: count,
    future_date: count,
    low_votes: count,
    empty_title: count,
    not_found: count,
    bad_shape: count,
  }),
});

export type RunSummary = z.infer<typeof runSummarySchema>;

/** A summary with every count at zero. */
export function emptyRunSummary(): RunSummary {
  return {
    stored: 0,
    updated: 0,
    removed: 0,
    failed: 0,
    embedded: 0,
    oldestAgeDays: null,
    skipped: {
      adult: 0,
      no_poster: 0,
      no_overview: 0,
      future_date: 0,
      low_votes: 0,
      empty_title: 0,
      not_found: 0,
      bad_shape: 0,
    },
  };
}

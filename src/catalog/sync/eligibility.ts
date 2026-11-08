import type { MappedMovie } from "./map-details";
import type { SkipReason } from "./run-summary";

/** Fewest TMDB votes a movie needs to enter the catalog (spec 0003, AC-1). */
export const MIN_VOTES = 500;

export type EligibilityReason = Extract<
  SkipReason,
  | "adult"
  | "empty_title"
  | "no_poster"
  | "no_overview"
  | "future_date"
  | "low_votes"
>;

/**
 * Decides whether a mapped movie may enter the catalog (AC-1, AC-3). Pure.
 * Returns the first rule it fails, checked in this order: adult, empty title,
 * poster, overview, release date, votes.
 *
 * `today` is a UTC date as `YYYY-MM-DD`. A movie with no release date fails as
 * `future_date`, because a movie with no year can be neither shown nor matched.
 */
export function isEligible(
  movie: MappedMovie,
  today: string,
): { eligible: true } | { eligible: false; reason: EligibilityReason } {
  if (movie.adult) return { eligible: false, reason: "adult" };
  if (movie.title === "") return { eligible: false, reason: "empty_title" };
  if (movie.posterPath === null)
    return { eligible: false, reason: "no_poster" };
  if (movie.overview === null)
    return { eligible: false, reason: "no_overview" };
  if (movie.releaseDate === null || movie.releaseDate > today) {
    return { eligible: false, reason: "future_date" };
  }
  if ((movie.voteCount ?? 0) < MIN_VOTES) {
    return { eligible: false, reason: "low_votes" };
  }
  return { eligible: true };
}

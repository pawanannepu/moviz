/** One stored title that has the same key as a row being matched. */
export type MatchCandidate = {
  movieId: number;
  /** The candidate movie's release year. */
  releaseYear: number;
  /** How the stored title relates to the movie: `alternate` is the weakest. */
  kind: "primary" | "original" | "alternate";
};

export type MatchOutcome =
  | { kind: "match"; movieId: number }
  | { kind: "ambiguous" }
  | { kind: "no_match" };

/**
 * Picks one movie for a row, or says it cannot (spec 0003, AC-4). Pure. Rules,
 * in order:
 *
 * 1. Only movies whose year equals the row's year, or is one year off, qualify.
 * 2. An exact year beats a one year difference.
 * 3. If more than one is left, a movie matched by its primary or original title
 *    beats one matched only by an alternate title.
 * 4. One movie left is a match. More than one is `ambiguous`: nothing is guessed.
 *
 * `candidates` holds each movie at most once (a movie has one row per title key).
 */
export function chooseMatch(
  year: number,
  candidates: MatchCandidate[],
): MatchOutcome {
  const near = candidates.filter(
    (candidate) => Math.abs(candidate.releaseYear - year) <= 1,
  );
  const exact = near.filter((candidate) => candidate.releaseYear === year);
  const byYear = exact.length > 0 ? exact : near;

  const strong = byYear.filter((candidate) => candidate.kind !== "alternate");
  const remaining = strong.length > 0 ? strong : byYear;

  if (remaining.length === 0) return { kind: "no_match" };
  if (remaining.length > 1) return { kind: "ambiguous" };
  return { kind: "match", movieId: remaining[0].movieId };
}

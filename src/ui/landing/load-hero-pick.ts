import { matchMovies } from "@/catalog/match/match-movies";
import { getMoviesByIds } from "@/catalog/read/get-movie";
import type { Db } from "@/db/create-db";
import { HERO_PICKS, type HeroPick } from "./hero-picks";

/**
 * Finds the movie for the landing page: the first of `HERO_PICKS` that the
 * catalog holds with a poster. A pick that is not found or is ambiguous is
 * skipped. Returns `null` when none qualifies, or when the database is
 * unavailable or throws, so the landing page can still render without a poster.
 */
export async function loadHeroPick(
  db: Db,
  picks: typeof HERO_PICKS = HERO_PICKS,
): Promise<HeroPick | null> {
  try {
    const matched = await matchMovies(
      db,
      picks.map(({ title, year }) => ({ title, year })),
    );
    if (!matched.ok) return null;

    const ids = matched.value.flatMap((outcome) =>
      outcome.kind === "match" ? [outcome.movieId] : [],
    );
    const found = await getMoviesByIds(db, ids);
    if (!found.ok) return null;
    const byId = new Map(found.value.map((movie) => [movie.id, movie]));

    for (const [index, pick] of picks.entries()) {
      const outcome = matched.value[index];
      if (outcome?.kind !== "match") continue;
      const movie = byId.get(outcome.movieId);
      if (!movie || movie.removed || movie.posterPath === null) continue;
      return {
        movie: {
          id: movie.id,
          title: movie.title,
          releaseYear: movie.releaseYear,
          posterPath: movie.posterPath,
        },
        reason: pick.reason,
      };
    }
    return null;
  } catch {
    return null;
  }
}

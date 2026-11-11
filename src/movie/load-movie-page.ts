import type { CatalogMovie } from "@/catalog/read/get-movie";
import type { Db } from "@/db/create-db";
import type { DbUnavailable, MovieNotFound } from "@/db/failure";
import { reasonSentence } from "@/feed/reason-sentence";
import { err, ok, type Result } from "@/lib/result";
import { reasonFor } from "@/recommend/reason-for";
import { readMovie } from "./read-movie";

/** What the detail page shows: the movie, and the finished reason sentence or null. */
export type MoviePage = { movie: CatalogMovie; reason: string | null };

/**
 * Reads everything the movie detail page shows (spec 0010): the movie and the
 * reason, side by side. The caller has already checked the user, because this
 * function trusts `userId`.
 *
 * - An unknown id and a movie the catalog withdrew both give `movie_not_found`.
 * - `db_unavailable` is returned only when the movie read fails. A reason that
 *   could not be read just leaves the page without its reason bar (AC-9).
 * - An `invalid_input` from the recommender is a bug in this feature, so it is
 *   thrown with a message that holds no data.
 */
export async function loadMoviePage(
  db: Db,
  input: { userId: string; movieId: number },
): Promise<Result<MoviePage, MovieNotFound | DbUnavailable>> {
  const [movie, reason] = await Promise.all([
    readMovie(db, input.movieId),
    reasonFor(db, input),
  ]);

  if (!movie.ok) return err(movie.error);
  if (movie.value.removed) return err({ code: "movie_not_found" });

  if (!reason.ok) {
    if (reason.error.code === "invalid_input") {
      throw new Error("The movie page sent the recommender an invalid input.");
    }
    return ok({ movie: movie.value, reason: null });
  }

  return ok({
    movie: movie.value,
    reason: reason.value ? reasonSentence(reason.value) : null,
  });
}

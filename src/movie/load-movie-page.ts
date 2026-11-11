import type { CatalogMovie } from "@/catalog/read/get-movie";
import type { Db } from "@/db/create-db";
import type { DbUnavailable, MovieNotFound } from "@/db/failure";
import { reasonSentence } from "@/feed/reason-sentence";
import { type FeedbackKind, feedbackFor } from "@/feedback/feedback";
import { err, ok, type Result } from "@/lib/result";
import { reasonFor } from "@/recommend/reason-for";
import { readMovie } from "./read-movie";

/**
 * What the detail page shows: the movie, the finished reason sentence or null,
 * and the feedback controls' first state, or null when the page shows no
 * controls (spec 0011, AC-11).
 */
export type MoviePage = {
  movie: CatalogMovie;
  reason: string | null;
  feedback: { kind: FeedbackKind | null } | null;
};

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
 * - The feedback controls show when the movie has a reason (the feed could
 *   show it) or the user marked it `not_interested` (spec 0011, AC-11). A
 *   feedback read that fails leaves them out, like a failed reason.
 */
export async function loadMoviePage(
  db: Db,
  input: { userId: string; movieId: number },
): Promise<Result<MoviePage, MovieNotFound | DbUnavailable>> {
  const [movie, reason, feedback] = await Promise.all([
    readMovie(db, input.movieId),
    reasonFor(db, input),
    feedbackFor(db, input),
  ]);

  if (!movie.ok) return err(movie.error);
  if (movie.value.removed) return err({ code: "movie_not_found" });

  if (!reason.ok) {
    if (reason.error.code === "invalid_input") {
      throw new Error("The movie page sent the recommender an invalid input.");
    }
    return ok({ movie: movie.value, reason: null, feedback: null });
  }

  const kind = feedback.ok ? feedback.value : null;
  const showControls =
    feedback.ok && (reason.value !== null || kind === "not_interested");
  return ok({
    movie: movie.value,
    reason: reason.value ? reasonSentence(reason.value) : null,
    feedback: showControls ? { kind } : null,
  });
}

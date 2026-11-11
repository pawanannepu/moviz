"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserForAction } from "@/auth/session";
import { db } from "@/db/client";
import { err, ok, type Result } from "@/lib/result";
import { saveRating } from "@/ratings/save-rating";
import { addToWatchlist, removeFromWatchlist } from "./watchlist";

const movieInput = z.object({ movieId: z.number().int().positive() });
const ratingInput = movieInput.extend({
  score: z.number().int().min(1).max(10),
});

export type MovieListActionError = {
  code:
    | "unauthenticated"
    | "invalid_input"
    | "already_rated"
    | "movie_not_found"
    | "user_not_found"
    | "db_unavailable";
};

/** Adds one movie to the signed in user's watchlist. */
export async function addToWatchlistAction(
  input: unknown,
): Promise<Result<void, MovieListActionError>> {
  const session = await getUserForAction();
  if (!session.ok) return err({ code: "unauthenticated" });
  const parsed = movieInput.safeParse(input);
  if (!parsed.success) return err({ code: "invalid_input" });
  const result = await addToWatchlist(db, {
    userId: session.user.id,
    movieId: parsed.data.movieId,
  });
  if (!result.ok) return err(result.error);
  revalidatePath("/lists");
  return ok(undefined);
}

/** Removes one movie from the signed in user's watchlist. */
export async function removeFromWatchlistAction(
  input: unknown,
): Promise<Result<void, MovieListActionError>> {
  const session = await getUserForAction();
  if (!session.ok) return err({ code: "unauthenticated" });
  const parsed = movieInput.safeParse(input);
  if (!parsed.success) return err({ code: "invalid_input" });
  const result = await removeFromWatchlist(db, {
    userId: session.user.id,
    movieId: parsed.data.movieId,
  });
  if (!result.ok) return err(result.error);
  revalidatePath("/lists");
  return ok(undefined);
}

/** Saves a manual half star rating, which marks the movie seen. */
export async function rateMovieAction(
  input: unknown,
): Promise<Result<void, MovieListActionError>> {
  const session = await getUserForAction();
  if (!session.ok) return err({ code: "unauthenticated" });
  const parsed = ratingInput.safeParse(input);
  if (!parsed.success) return err({ code: "invalid_input" });
  const result = await saveRating(db, {
    userId: session.user.id,
    movieId: parsed.data.movieId,
    score: parsed.data.score,
    source: "manual",
  });
  if (!result.ok) {
    return err(
      result.error.code === "invalid_score"
        ? { code: "invalid_input" }
        : result.error,
    );
  }
  revalidatePath("/lists");
  revalidatePath("/home");
  return ok(undefined);
}

import { and, asc, inArray, sql } from "drizzle-orm";
import { isListable } from "@/catalog/listable";
import type { Db } from "@/db/create-db";
import { type DbUnavailable, toDbFailure } from "@/db/failure";
import { movieGenres, movies } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import type { SwipeCardMovie } from "@/ui/swipe-card/swipe-card";
import { unavailableMovies } from "@/user-data/exclusions";
import { countProgress, type Progress } from "./count-progress";
import { POOL_SIZE } from "./deck-rules";
import { orderDeck } from "./order-deck";

export type Deck = Progress & {
  /** The cards still to swipe, in deck order. Only the fields the card shows. */
  cards: SwipeCardMovie[];
};

/**
 * Loads the onboarding deck for one user (spec 0006, AC-2). The pool is the
 * `POOL_SIZE` listable movies with the most votes, ordered once by genre
 * rotation, then stripped of every movie the user has rated or skipped. Genres
 * are read for the ordering only and never leave this function.
 */
export async function loadDeck(
  db: Db,
  input: { userId: string },
): Promise<Result<Deck, DbUnavailable>> {
  const { userId } = input;
  try {
    const progress = countProgress(db, { userId });

    const pool = await db
      .select({
        id: movies.id,
        title: movies.title,
        releaseYear: movies.releaseYear,
        posterPath: movies.posterPath,
      })
      .from(movies)
      .where(isListable())
      .orderBy(sql`${movies.voteCount} desc nulls last`, asc(movies.id))
      .limit(POOL_SIZE);

    const poolIds = pool.map((movie) => movie.id);
    const [genreRows, availableRows, counted] = await Promise.all([
      poolIds.length === 0
        ? []
        : db
            .select({
              movieId: movieGenres.movieId,
              genreId: movieGenres.genreId,
            })
            .from(movieGenres)
            .where(inArray(movieGenres.movieId, poolIds)),
      poolIds.length === 0
        ? []
        : db
            .select({ id: movies.id })
            .from(movies)
            .where(
              and(
                inArray(movies.id, poolIds),
                unavailableMovies(userId, movies.id, "deck"),
              ),
            ),
      progress,
    ]);
    if (!counted.ok) return err(counted.error);

    const genresByMovie = new Map<number, number[]>();
    for (const { movieId, genreId } of genreRows) {
      genresByMovie.set(movieId, [
        ...(genresByMovie.get(movieId) ?? []),
        genreId,
      ]);
    }
    const available = new Set(availableRows.map((row) => row.id));

    // Order the whole pool first, so every user sees the same order, then drop
    // what this user has dealt with. Progress is counted, not positional.
    const cards = orderDeck(
      pool.map((movie) => ({
        ...movie,
        genreIds: genresByMovie.get(movie.id) ?? [],
      })),
    )
      .filter((movie) => available.has(movie.id))
      .map(({ id, title, releaseYear, posterPath }) => ({
        id,
        title,
        releaseYear,
        posterPath,
      }));

    return ok({
      cards,
      rated: counted.value.rated,
      shown: counted.value.shown,
    });
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }
}

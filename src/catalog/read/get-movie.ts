import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import {
  type DbUnavailable,
  type MovieNotFound,
  toDbFailure,
} from "@/db/failure";
import { credits, genres, movieGenres, movies, people } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

export type CatalogPerson = {
  /** Our people id (not the TMDB person id). */
  personId: number;
  name: string;
  profilePath: string | null;
};

export type CastMember = CatalogPerson & { characterName: string | null };

/** A catalog movie as the rest of the app reads it. */
export type CatalogMovie = {
  id: number;
  title: string;
  originalTitle: string | null;
  /** `YYYY-MM-DD`, or null. */
  releaseDate: string | null;
  releaseYear: number | null;
  overview: string | null;
  tagline: string | null;
  runtimeMinutes: number | null;
  posterPath: string | null;
  originalLanguage: string | null;
  popularity: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  /**
   * True when TMDB no longer returns the movie. Its TMDB content is gone, the
   * lists below are empty, and only the title, release date and id are kept so a
   * user's own lists still render (AC-6, AC-12).
   */
  removed: boolean;
  /** Genre names, alphabetical. */
  genres: string[];
  /** In billing order. */
  directors: CatalogPerson[];
  /** In billing order. */
  cast: CastMember[];
};

export type GetMovieError = MovieNotFound | DbUnavailable;

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) group.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
}

/**
 * Reads many movies with their genres, directors and cast, in a fixed number of
 * queries (three at most) however many ids are asked for. Results follow the
 * order of `ids`; ids that do not exist are left out. A removed movie is
 * returned with `removed: true` and empty lists.
 *
 * Callers pass a page of ids (at most a few hundred), not the whole catalog.
 */
export async function getMoviesByIds(
  db: Db,
  ids: number[],
): Promise<Result<CatalogMovie[], DbUnavailable>> {
  if (ids.length === 0) return ok([]);
  const uniqueIds = [...new Set(ids)];

  try {
    const rows = await db
      .select({
        id: movies.id,
        title: movies.title,
        originalTitle: movies.originalTitle,
        releaseDate: movies.releaseDate,
        releaseYear: movies.releaseYear,
        overview: movies.overview,
        tagline: movies.tagline,
        runtimeMinutes: movies.runtimeMinutes,
        posterPath: movies.posterPath,
        originalLanguage: movies.originalLanguage,
        popularity: movies.popularity,
        voteAverage: movies.voteAverage,
        voteCount: movies.voteCount,
        sourceMissingAt: movies.sourceMissingAt,
      })
      .from(movies)
      .where(inArray(movies.id, uniqueIds));

    const liveIds = rows
      .filter((row) => row.sourceMissingAt === null)
      .map((row) => row.id);

    const [genreRows, creditRows] =
      liveIds.length === 0
        ? [[], []]
        : await Promise.all([
            db
              .select({ movieId: movieGenres.movieId, name: genres.name })
              .from(movieGenres)
              .innerJoin(genres, eq(genres.id, movieGenres.genreId))
              .where(inArray(movieGenres.movieId, liveIds))
              .orderBy(genres.name),
            db
              .select({
                movieId: credits.movieId,
                role: credits.role,
                characterName: credits.characterName,
                personId: people.id,
                name: people.name,
                profilePath: people.profilePath,
              })
              .from(credits)
              .innerJoin(people, eq(people.id, credits.personId))
              .where(inArray(credits.movieId, liveIds))
              .orderBy(credits.billingOrder, people.id),
          ]);

    const genresByMovie = groupBy(genreRows, (row) => row.movieId);
    const creditsByMovie = groupBy(creditRows, (row) => row.movieId);
    const byId = new Map<number, CatalogMovie>();
    for (const { sourceMissingAt, ...row } of rows) {
      const movieCredits = creditsByMovie.get(row.id) ?? [];
      byId.set(row.id, {
        ...row,
        removed: sourceMissingAt !== null,
        genres: (genresByMovie.get(row.id) ?? []).map((genre) => genre.name),
        directors: movieCredits
          .filter((credit) => credit.role === "director")
          .map(({ personId, name, profilePath }) => ({
            personId,
            name,
            profilePath,
          })),
        cast: movieCredits
          .filter((credit) => credit.role === "cast")
          .map(({ personId, name, profilePath, characterName }) => ({
            personId,
            name,
            profilePath,
            characterName,
          })),
      });
    }

    return ok(ids.flatMap((id) => byId.get(id) ?? []));
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }
}

/**
 * Reads one movie with its genres, directors and cast. An unknown id gives
 * `movie_not_found`. A removed movie is returned with `removed: true` (see
 * `CatalogMovie`).
 */
export async function getMovie(
  db: Db,
  id: number,
): Promise<Result<CatalogMovie, GetMovieError>> {
  const result = await getMoviesByIds(db, [id]);
  if (!result.ok) return err(result.error);
  const movie = result.value[0];
  return movie ? ok(movie) : err({ code: "movie_not_found" });
}

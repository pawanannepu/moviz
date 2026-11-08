import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import { type DbUnavailable, toDbFailure } from "@/db/failure";
import {
  credits,
  genres,
  movieEmbeddings,
  movieExternalIds,
  movieGenres,
  movies,
  movieTitles,
  people,
} from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import { lockMovieWrite } from "./locks";
import type { MappedMovie } from "./map-details";

export type PersistError = DbUnavailable | { code: "empty_title" };

export type PersistedMovie = {
  /** Our movie id (not the TMDB id). */
  movieId: number;
  /** True when this call created the row, false when it rewrote an existing one. */
  created: boolean;
};

/**
 * The write path shared by the seed and the cron job (spec 0003). Writes one
 * movie, its titles, genres, people and credits in a single transaction, under a
 * per TMDB id lock, so a run that stops halfway leaves nothing half written and
 * two runs on one movie end with one consistent row (AC-2, AC-18).
 *
 * The caller decides whether the movie may enter the catalog (`isEligible`).
 * This function only refuses a movie with no title, because every stored movie
 * must have a `primary` title row (AC-3). Writing also clears `source_missing_at`,
 * which is how a removed movie comes back when TMDB returns it again.
 *
 * Child rows are replaced, not merged. If the movie now has no poster its
 * embeddings are deleted (AC-19). `release_year` and `search` are generated, so
 * they are never written.
 */
export async function persistMovie(
  db: Db,
  movie: MappedMovie,
): Promise<Result<PersistedMovie, PersistError>> {
  if (movie.title === "" || movie.titles.length === 0) {
    return err({ code: "empty_title" });
  }

  try {
    const persisted = await db.transaction(async (tx) => {
      await lockMovieWrite(tx, movie.tmdbId);

      const columns = {
        title: movie.title,
        originalTitle: movie.originalTitle,
        titleNormalized: movie.titleNormalized,
        releaseDate: movie.releaseDate,
        overview: movie.overview,
        tagline: movie.tagline,
        runtimeMinutes: movie.runtimeMinutes,
        posterPath: movie.posterPath,
        originalLanguage: movie.originalLanguage,
        popularity: movie.popularity,
        voteAverage: movie.voteAverage,
        voteCount: movie.voteCount,
        sourceMissingAt: null,
        fetchedAt: sql`now()`,
        updatedAt: sql`now()`,
      };

      const [existing] = await tx
        .select({ movieId: movieExternalIds.movieId })
        .from(movieExternalIds)
        .where(
          and(
            eq(movieExternalIds.provider, "tmdb"),
            eq(movieExternalIds.externalId, String(movie.tmdbId)),
          ),
        );

      let movieId: number;
      let created: boolean;
      if (existing) {
        movieId = existing.movieId;
        created = false;
        await tx.update(movies).set(columns).where(eq(movies.id, movieId));
      } else {
        const [inserted] = await tx
          .insert(movies)
          .values(columns)
          .returning({ id: movies.id });
        movieId = inserted.id;
        created = true;
        await tx.insert(movieExternalIds).values({
          provider: "tmdb",
          externalId: String(movie.tmdbId),
          movieId,
        });
      }

      // Genres: create the ones we have not seen, in name order so two writes
      // cannot lock them in opposite orders.
      let genreIds: number[] = [];
      if (movie.genres.length > 0) {
        await tx
          .insert(genres)
          .values(movie.genres.map((name) => ({ name })))
          .onConflictDoNothing({ target: genres.name });
        const rows = await tx
          .select({ id: genres.id })
          .from(genres)
          .where(inArray(genres.name, movie.genres));
        genreIds = rows.map((row) => row.id);
      }

      // People: one row per TMDB person, written in id order for the same reason.
      const personByTmdbId = new Map<
        number,
        { tmdbId: number; name: string; profilePath: string | null }
      >();
      for (const credit of movie.credits) {
        if (!personByTmdbId.has(credit.tmdbPersonId)) {
          personByTmdbId.set(credit.tmdbPersonId, {
            tmdbId: credit.tmdbPersonId,
            name: credit.name,
            profilePath: credit.profilePath,
          });
        }
      }
      const personIds = new Map<number, number>();
      if (personByTmdbId.size > 0) {
        const rows = await tx
          .insert(people)
          .values(
            [...personByTmdbId.values()].sort((a, b) => a.tmdbId - b.tmdbId),
          )
          .onConflictDoUpdate({
            target: people.tmdbId,
            set: {
              name: sql`excluded.name`,
              profilePath: sql`excluded.profile_path`,
            },
          })
          .returning({ id: people.id, tmdbId: people.tmdbId });
        for (const row of rows) {
          if (row.tmdbId !== null) personIds.set(row.tmdbId, row.id);
        }
      }

      // Replace the child rows.
      await tx.delete(movieTitles).where(eq(movieTitles.movieId, movieId));
      await tx
        .insert(movieTitles)
        .values(movie.titles.map((title) => ({ movieId, ...title })));

      await tx.delete(movieGenres).where(eq(movieGenres.movieId, movieId));
      if (genreIds.length > 0) {
        await tx
          .insert(movieGenres)
          .values(genreIds.map((genreId) => ({ movieId, genreId })));
      }

      await tx.delete(credits).where(eq(credits.movieId, movieId));
      const creditRows = movie.credits.flatMap((credit) => {
        const personId = personIds.get(credit.tmdbPersonId);
        if (personId === undefined) return [];
        return [
          {
            movieId,
            personId,
            role: credit.role,
            billingOrder: credit.billingOrder,
            characterName: credit.characterName,
          },
        ];
      });
      if (creditRows.length > 0) await tx.insert(credits).values(creditRows);

      // A movie with no poster is not listable, so it keeps no embedding.
      if (movie.posterPath === null) {
        await tx
          .delete(movieEmbeddings)
          .where(eq(movieEmbeddings.movieId, movieId));
      }

      return { movieId, created };
    });
    return ok(persisted);
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }
}

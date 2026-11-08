import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import { type DbUnavailable, toDbFailure } from "@/db/failure";
import {
  credits,
  movieEmbeddings,
  movieExternalIds,
  movieGenres,
  movies,
  movieTitles,
} from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import { lockMovieWrite } from "./locks";

/**
 * Marks a movie as withdrawn by TMDB (spec 0003, AC-12): TMDB returned "not
 * found", or the movie turned out to be adult. The row stays so a user's
 * ratings and lists still work. Everything that came from TMDB beyond the title,
 * the release date and the primary title key is removed: overview, tagline,
 * poster, original title, runtime, language, popularity, votes, genres, credits,
 * alternate and original titles, and embeddings. Runs in one transaction under
 * the same lock as `persistMovie`.
 *
 * `source_missing_at` is set to now only the first time, so the timestamp keeps
 * saying when the movie was first withdrawn. Returns `unknown` when no movie is
 * stored for this TMDB id (there is nothing to mark).
 */
export async function markMovieRemoved(
  db: Db,
  tmdbId: number,
): Promise<
  Result<
    { kind: "removed"; movieId: number } | { kind: "unknown" },
    DbUnavailable
  >
> {
  try {
    const outcome = await db.transaction(async (tx) => {
      await lockMovieWrite(tx, tmdbId);

      const [stored] = await tx
        .select({
          movieId: movieExternalIds.movieId,
          sourceMissingAt: movies.sourceMissingAt,
        })
        .from(movieExternalIds)
        .innerJoin(movies, eq(movies.id, movieExternalIds.movieId))
        .where(
          and(
            eq(movieExternalIds.provider, "tmdb"),
            eq(movieExternalIds.externalId, String(tmdbId)),
          ),
        );
      if (!stored) return { kind: "unknown" as const };
      const { movieId } = stored;

      await tx
        .update(movies)
        .set({
          overview: null,
          tagline: null,
          posterPath: null,
          originalTitle: null,
          runtimeMinutes: null,
          originalLanguage: null,
          popularity: null,
          voteAverage: null,
          voteCount: null,
          ...(stored.sourceMissingAt === null
            ? { sourceMissingAt: new Date() }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(movies.id, movieId));

      await tx.delete(movieGenres).where(eq(movieGenres.movieId, movieId));
      await tx.delete(credits).where(eq(credits.movieId, movieId));
      await tx
        .delete(movieEmbeddings)
        .where(eq(movieEmbeddings.movieId, movieId));
      await tx
        .delete(movieTitles)
        .where(
          and(
            eq(movieTitles.movieId, movieId),
            ne(movieTitles.kind, "primary"),
          ),
        );

      return { kind: "removed" as const, movieId };
    });
    return ok(outcome);
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }
}

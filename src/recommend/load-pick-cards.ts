import { and, eq, inArray, sql } from "drizzle-orm";
import { isListable } from "@/catalog/listable";
import type { Executor } from "@/db/create-db";
import { genres, movieGenres, movies } from "@/db/schema";
import type { MovieCardMovie } from "@/ui/movie-card";

/**
 * Reads the card fields and genre names for the chosen ids in one query, and
 * returns the cards in the order of `ids` (an `IN` read has no order). Genres
 * are names sorted alphabetically, `[]` when there are none. A movie that is no
 * longer listable at this read is dropped, so the batch can be one short; inside
 * one snapshot that should not happen (spec 0007).
 */
export async function loadPickCards(
  executor: Executor,
  ids: readonly number[],
): Promise<MovieCardMovie[]> {
  if (ids.length === 0) return [];
  const rows = await executor
    .select({
      id: movies.id,
      title: movies.title,
      releaseYear: movies.releaseYear,
      posterPath: movies.posterPath,
      genres: sql<string[]>`coalesce(
        array_agg(${genres.name} order by ${genres.name})
          filter (where ${genres.name} is not null),
        '{}'
      )`,
    })
    .from(movies)
    .leftJoin(movieGenres, eq(movieGenres.movieId, movies.id))
    .leftJoin(genres, eq(genres.id, movieGenres.genreId))
    .where(and(inArray(movies.id, [...ids]), isListable()))
    .groupBy(movies.id);

  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

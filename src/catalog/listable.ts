import { type SQL, sql } from "drizzle-orm";
import { movies } from "@/db/schema";

/**
 * The one shared rule for what the swipe deck and the feed may show: the movie
 * is still returned by TMDB and has a poster. Embed it in a `WHERE` beside
 * `unavailableMovies`:
 *
 * ```ts
 * db.select().from(movies).where(and(isListable(), unavailableMovies(userId, movies.id, "feed")))
 * ```
 *
 * Movies a user already rated stay readable in their own lists even when this
 * is false, so list queries do not use it.
 */
export function isListable(): SQL {
  return sql`(${movies.sourceMissingAt} is null and ${movies.posterPath} is not null)`;
}

import { type AnyColumn, type SQL, sql } from "drizzle-orm";
import { ratings, swipeSkips } from "@/db/schema";

/** Where the movies are shown: the swipe deck or the personalized feed. */
export type Surface = "deck" | "feed";

/**
 * The one shared filter that hides movies a user has already dealt with. Embed
 * it in a `WHERE` of a deck or feed query:
 *
 * ```ts
 * db.select().from(movies).where(unavailableMovies(userId, movies.id, "feed"))
 * ```
 *
 * Today both surfaces hide rated and skipped movies. Feature 13 adds watchlisted
 * movies to the deck only (the feed keeps them); feature 14 adds `not_interested`
 * to both (`more_like_this` stays visible). The signature does not change, which is
 * why `surface` is accepted before anything reads it.
 */
export function unavailableMovies(
  userId: string,
  movieIdColumn: AnyColumn,
  _surface: Surface,
): SQL {
  const notRated = sql`not exists (
    select 1 from ${ratings}
    where ${ratings.userId} = ${userId}::text and ${ratings.movieId} = ${movieIdColumn}
  )`;
  const notSkipped = sql`not exists (
    select 1 from ${swipeSkips}
    where ${swipeSkips.userId} = ${userId}::text and ${swipeSkips.movieId} = ${movieIdColumn}
  )`;
  return sql`(${notRated} and ${notSkipped})`;
}

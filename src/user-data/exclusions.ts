import { type AnyColumn, type SQL, sql } from "drizzle-orm";
import { feedFeedback, ratings, swipeSkips } from "@/db/schema";

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
 * Both surfaces hide rated, skipped and `not_interested` movies (spec 0011,
 * AC-4); a `more_like_this` movie stays visible. Feature 13 may add watchlisted
 * movies to the deck only (the feed keeps them). The signature does not change,
 * which is why `surface` is accepted before anything reads it.
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
  const notDismissed = sql`not exists (
    select 1 from ${feedFeedback}
    where ${feedFeedback.userId} = ${userId}::text and ${feedFeedback.movieId} = ${movieIdColumn}
      and ${feedFeedback.kind} = 'not_interested'
  )`;
  return sql`(${notRated} and ${notSkipped} and ${notDismissed})`;
}

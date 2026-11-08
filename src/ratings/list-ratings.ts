import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  type InvalidCursor,
} from "@/db/cursor";
import { type DbUnavailable, toDbFailure } from "@/db/failure";
import { ratings } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import type { Rating } from "./save-rating";

export type ListRatingsError = InvalidCursor | DbUnavailable;

export type RatingsPage = {
  items: Rating[];
  /** Pass back as `cursor` for the next page. Null on the last page. */
  nextCursor: string | null;
};

/**
 * One page of the user's ratings, newest change first (`updated_at` desc, then
 * `movie_id` desc). Pages by an opaque cursor, so rows added or changed while
 * paging never cause a skipped or repeated row. Default page size 50, maximum 100.
 */
export async function listRatings(
  db: Db,
  input: { userId: string; cursor?: string; limit?: number },
): Promise<Result<RatingsPage, ListRatingsError>> {
  const limit = clampLimit(input.limit);

  let after = sql`true`;
  if (input.cursor !== undefined) {
    const decoded = decodeCursor(input.cursor);
    if (!decoded.ok) return err(decoded.error);
    const { timestamp, id } = decoded.value;
    // Compared as a row tuple, with the timestamp still in its text form.
    after = sql`(${ratings.updatedAt}, ${ratings.movieId}) < (${timestamp}::timestamptz, ${id}::bigint)`;
  }

  try {
    const rows = await db
      .select({
        userId: ratings.userId,
        movieId: ratings.movieId,
        score: ratings.score,
        source: ratings.source,
        ratedAt: ratings.ratedAt,
        updatedAt: ratings.updatedAt,
        updatedAtText: sql<string>`${ratings.updatedAt}::text`,
      })
      .from(ratings)
      .where(and(eq(ratings.userId, input.userId), after))
      .orderBy(desc(ratings.updatedAt), desc(ratings.movieId))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const nextCursor =
      rows.length > limit && last
        ? encodeCursor({ timestamp: last.updatedAtText, id: last.movieId })
        : null;
    const items = page.map(({ updatedAtText: _text, ...rating }) => rating);
    return ok({ items, nextCursor });
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }
}

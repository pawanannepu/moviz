import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "@/db/create-db";
import {
  type DbUnavailable,
  type MovieNotFound,
  toDbFailure,
  unexpectedDbError,
} from "@/db/failure";
import { feedFeedback } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import { pgArray } from "@/recommend/pg-array";

/** What a user told the feed about one movie. */
export type FeedbackKind = (typeof feedFeedback.$inferSelect)["kind"];

export type SetFeedbackError = MovieNotFound | DbUnavailable;

/** The most movie ids `moreLikeThisIds` reads in one call (one feed batch fits). */
export const MORE_LIKE_THIS_IDS_LIMIT = 50;

/** Maps an expected failure, or throws a clean error that holds no ids or kinds. */
function fail<E extends { code: string }>(
  where: string,
  error: unknown,
  allowed: readonly E["code"][],
): { ok: false; error: E } {
  const failure = toDbFailure(error);
  if (failure && (allowed as readonly string[]).includes(failure.code)) {
    return err(failure as unknown as E);
  }
  throw unexpectedDbError(where, error);
}

/**
 * Saves one feedback row for the user and movie (spec 0011, AC-13). Setting the
 * same kind again keeps the row and its `created_at`; setting the other kind
 * replaces it and resets `created_at`. An unknown movie gives `movie_not_found`
 * from the foreign key, with no separate read. The caller passes the session user.
 */
export async function setFeedback(
  db: Executor,
  input: { userId: string; movieId: number; kind: FeedbackKind },
): Promise<Result<void, SetFeedbackError>> {
  const { userId, movieId, kind } = input;
  try {
    await db
      .insert(feedFeedback)
      .values({ userId, movieId, kind })
      .onConflictDoUpdate({
        target: [feedFeedback.userId, feedFeedback.movieId],
        set: {
          kind: sql`excluded.kind`,
          createdAt: sql`case when ${feedFeedback.kind} = excluded.kind then ${feedFeedback.createdAt} else now() end`,
        },
      });
    return ok(undefined);
  } catch (error) {
    return fail<SetFeedbackError>("setFeedback", error, [
      "movie_not_found",
      "db_unavailable",
    ]);
  }
}

/** Removes the user's feedback on one movie. No row to remove is still a success. */
export async function clearFeedback(
  db: Executor,
  input: { userId: string; movieId: number },
): Promise<Result<void, DbUnavailable>> {
  try {
    await db
      .delete(feedFeedback)
      .where(
        and(
          eq(feedFeedback.userId, input.userId),
          eq(feedFeedback.movieId, input.movieId),
        ),
      );
    return ok(undefined);
  } catch (error) {
    return fail<DbUnavailable>("clearFeedback", error, ["db_unavailable"]);
  }
}

/** The user's feedback on one movie, or null when there is none. */
export async function feedbackFor(
  db: Executor,
  input: { userId: string; movieId: number },
): Promise<Result<FeedbackKind | null, DbUnavailable>> {
  try {
    const [row] = await db
      .select({ kind: feedFeedback.kind })
      .from(feedFeedback)
      .where(
        and(
          eq(feedFeedback.userId, input.userId),
          eq(feedFeedback.movieId, input.movieId),
        ),
      );
    return ok(row?.kind ?? null);
  } catch (error) {
    return fail<DbUnavailable>("feedbackFor", error, ["db_unavailable"]);
  }
}

/**
 * Which of `movieIds` the user marked "more like this", in one query. Feeds the
 * pressed state of the feed's buttons for one batch. Takes at most
 * `MORE_LIKE_THIS_IDS_LIMIT` ids; an empty list makes no query.
 */
export async function moreLikeThisIds(
  db: Executor,
  input: { userId: string; movieIds: readonly number[] },
): Promise<Result<Set<number>, DbUnavailable>> {
  const ids = input.movieIds.filter(Number.isSafeInteger);
  if (ids.length === 0) return ok(new Set());
  if (ids.length > MORE_LIKE_THIS_IDS_LIMIT) {
    throw new Error(
      `moreLikeThisIds takes at most ${MORE_LIKE_THIS_IDS_LIMIT} ids`,
    );
  }
  try {
    const rows = await db
      .select({ movieId: feedFeedback.movieId })
      .from(feedFeedback)
      .where(
        and(
          eq(feedFeedback.userId, input.userId),
          eq(feedFeedback.kind, "more_like_this"),
          sql`${feedFeedback.movieId} = any(${pgArray(ids)}::bigint[])`,
        ),
      );
    return ok(new Set(rows.map((row) => row.movieId)));
  } catch (error) {
    return fail<DbUnavailable>("moreLikeThisIds", error, ["db_unavailable"]);
  }
}

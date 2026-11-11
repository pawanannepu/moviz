import { sql } from "drizzle-orm";
import { z } from "zod";
import { EMBEDDING_MODEL } from "@/catalog/embedding/model";
import { isListable } from "@/catalog/listable";
import type { Db, Executor } from "@/db/create-db";
import { toDbFailure, unexpectedDbError } from "@/db/failure";
import { movies } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import { unavailableMovies } from "@/user-data/exclusions";
import { loadTaste, positiveAnchors, type TasteAnchor } from "./load-taste";
import { pgArray } from "./pg-array";
import { reasonFromAnchor, tasteStrength } from "./rules";
import type { Reason, RecommendError } from "./types";

const inputSchema = z.object({
  userId: z.string().min(1),
  movieId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export type ReasonForInput = { userId: string; movieId: number };

/** True when the feed could show this movie to this user: listable and not dealt with. */
async function canHaveReason(
  tx: Executor,
  input: ReasonForInput,
): Promise<boolean> {
  const result = await tx.execute(sql`
    select 1
    from ${movies}
    where ${movies.id} = ${input.movieId}::bigint
      and ${isListable()}
      and ${unavailableMovies(input.userId, movies.id, "feed")}
    limit 1
  `);
  return result.rows.length > 0;
}

/**
 * The id of the liked anchor with the largest `weight * similarity` for this
 * movie, ties to the lower anchor id: the same rule `scoreCandidates` uses to
 * name a pick's anchor. Returns null when the movie has no embedding for the
 * current model, because the join then yields no row.
 *
 * The order is on a weighted product over at most 30 anchor rows, never
 * `ORDER BY embedding <=> $vector`, so the planner has no use for the HNSW
 * index and the read stays exact.
 */
async function bestAnchorId(
  tx: Executor,
  movieId: number,
  liked: readonly TasteAnchor[],
): Promise<number | null> {
  const anchorIds = pgArray(liked.map((anchor) => anchor.movieId));
  const anchorWeights = pgArray(liked.map((anchor) => anchor.weight));

  const result = await tx.execute<{ anchor_id: string }>(sql`
    select a.movie_id as anchor_id
    from unnest(${anchorIds}::bigint[], ${anchorWeights}::float8[])
      as a(movie_id, weight)
    join movie_embeddings ae
      on ae.movie_id = a.movie_id and ae.model = ${EMBEDDING_MODEL}
    join movie_embeddings me
      on me.movie_id = ${movieId}::bigint and me.model = ${EMBEDDING_MODEL}
    -- The page's own movie is never its anchor (spec 0011, AC-7).
    where a.movie_id <> ${movieId}::bigint
    order by a.weight * (1 - (me.embedding <=> ae.embedding)) desc,
      a.movie_id asc
    limit 1
  `);
  const row = result.rows[0];
  return row ? Number(row.anchor_id) : null;
}

/**
 * Why one movie would be picked for this user, for the movie detail page
 * (spec 0010, AC-7). It follows the feed's own rule, so with unchanged ratings
 * the page shows the reason the feed card showed:
 *
 * - `null` when the feed could not show the movie to this user: it is not
 *   listable, or the user already rated or skipped it.
 * - `popular` when the user has no liked movie with an embedding, or this
 *   movie has no embedding.
 * - Otherwise `similar_to_liked`, naming the liked anchor with the largest
 *   `weight * similarity`, ties to the lower movie id, from the same capped
 *   anchors the feed uses, or `more_like_this` when that anchor is a movie
 *   the user asked for more like (spec 0011). The page's own movie is never
 *   its anchor.
 *
 * The caller passes the user id from the live session. At most four reads, in
 * one read only `REPEATABLE READ` transaction, whatever the rating count.
 * Returns `invalid_input` for a bad argument and `db_unavailable` when the
 * database cannot be reached; any other error is a bug and is thrown again as
 * a clean error that holds no ids, scores or query parameters.
 */
export async function reasonFor(
  db: Db,
  input: ReasonForInput,
): Promise<Result<Reason | null, RecommendError>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return err({ code: "invalid_input" });
  const { userId, movieId } = parsed.data;

  try {
    const value = await db.transaction(
      async (tx): Promise<Reason | null> => {
        if (!(await canHaveReason(tx, { userId, movieId }))) return null;

        const taste = await loadTaste(tx, userId);
        const strength = tasteStrength(
          taste.likedCount + taste.moreLikeThisCount,
        );
        if (strength === "none") return { kind: "popular" };

        const positive = positiveAnchors(taste);
        const anchorId = await bestAnchorId(tx, movieId, positive);
        const anchor = positive.find((a) => a.movieId === anchorId);
        if (!anchor) return { kind: "popular" };
        return reasonFromAnchor(anchor);
      },
      { accessMode: "read only", isolationLevel: "repeatable read" },
    );
    return ok(value);
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw unexpectedDbError("reasonFor", error);
  }
}

import { sql } from "drizzle-orm";
import { EMBEDDING_MODEL } from "@/catalog/embedding/model";
import type { Executor } from "@/db/create-db";
import { feedFeedback, movieEmbeddings, movies, ratings } from "@/db/schema";
import { isLikedScore, ratingWeight } from "./rules";
import type { Anchor, FeedbackAnchor } from "./types";
import {
  DISLIKED_ANCHORS,
  LIKED_ANCHORS,
  MORE_LIKE_THIS_ANCHORS,
  MORE_LIKE_THIS_WEIGHT,
} from "./weights";

/** A rated movie used to score candidates: its id, its pull and what a reason needs. */
export type RatingAnchor = Anchor & { weight: number; source: "rating" };

/** A movie the user asked for more like, used as an extra liked anchor (spec 0011). */
export type MoreLikeThisAnchor = FeedbackAnchor & {
  weight: number;
  source: "more_like_this";
};

/** Any anchor. `source` says where it came from, and so which reason it gives. */
export type TasteAnchor = RatingAnchor | MoreLikeThisAnchor;

export type Taste = {
  /** Liked ratings with a current embedding, not limited to the anchor cap. */
  likedCount: number;
  /** Disliked ratings with a current embedding, not limited to the anchor cap. */
  dislikedCount: number;
  /** Unrated "More like this" movies with a current embedding, not limited to the cap. */
  moreLikeThisCount: number;
  /** Up to `LIKED_ANCHORS` strongest liked ratings, positive weights. */
  liked: RatingAnchor[];
  /** Up to `DISLIKED_ANCHORS` strongest disliked ratings, negative weights. */
  disliked: RatingAnchor[];
  /** Up to `MORE_LIKE_THIS_ANCHORS` newest "More like this" movies, weight `MORE_LIKE_THIS_WEIGHT`. */
  moreLikeThis: MoreLikeThisAnchor[];
};

/** Liked rating anchors and "More like this" anchors together: every positive anchor. */
export function positiveAnchors(taste: Taste): TasteAnchor[] {
  return [...taste.liked, ...taste.moreLikeThis];
}

type CountRow = { liked: string; disliked: string; more_like_this: string };
type AnchorRow = {
  movie_id: string;
  score: number | null;
  title: string;
  release_year: number | null;
  source: "rating" | "more_like_this";
};

/** The `more_like_this` rows with an embedding for the current model. */
const feedbackAnchorFrom = sql`
  from ${feedFeedback}
  join ${movieEmbeddings}
    on ${movieEmbeddings.movieId} = ${feedFeedback.movieId}
    and ${movieEmbeddings.model} = ${EMBEDDING_MODEL}
`;

/** Only this user's `more_like_this` rows, and never a rated movie (AC-6, AC-10). */
const feedbackAnchorWhere = (userId: string) => sql`
  where ${feedFeedback.userId} = ${userId}::text
    and ${feedFeedback.kind} = 'more_like_this'
    and not exists (
      select 1 from ${ratings} r
      where r.user_id = ${userId}::text
        and r.movie_id = ${feedFeedback.movieId}
    )
`;

/**
 * Reads the user's taste in two queries: the counts, then the capped anchors.
 * Only movies with an embedding for the current model count (a movie the
 * catalog withdrew has none). Anchors carry ids, weights, titles, years and
 * scores only; an embedding is never loaded into Node (AC-5, AC-7). Binds
 * `userId` in both reads (AC-16). Strongest means the largest absolute weight,
 * then the newest `updated_at`, then the highest movie id.
 *
 * "More like this" anchors (spec 0011, AC-6) ride in the same two queries, so
 * the statement count does not grow: the newest `MORE_LIKE_THIS_ANCHORS`
 * unrated ones, by `created_at` then the highest movie id. A rated movie is
 * never one: the rating decides (AC-10).
 */
export async function loadTaste(
  executor: Executor,
  userId: string,
): Promise<Taste> {
  const counts = await executor.execute<CountRow>(sql`
    select
      count(*) filter (where ${ratings.score} >= 6) as liked,
      count(*) filter (where ${ratings.score} <= 5) as disliked,
      (
        select count(*) ${feedbackAnchorFrom} ${feedbackAnchorWhere(userId)}
      ) as more_like_this
    from ${ratings}
    join ${movieEmbeddings}
      on ${movieEmbeddings.movieId} = ${ratings.movieId}
      and ${movieEmbeddings.model} = ${EMBEDDING_MODEL}
    where ${ratings.userId} = ${userId}::text
  `);

  const anchors = await executor.execute<AnchorRow>(sql`
    select ranked.movie_id, ranked.score, ranked.title, ranked.release_year,
      'rating' as source
    from (
      select
        ${ratings.movieId} as movie_id,
        ${ratings.score} as score,
        ${movies.title} as title,
        ${movies.releaseYear} as release_year,
        (${ratings.score} >= 6) as is_liked,
        row_number() over (
          partition by (${ratings.score} >= 6)
          order by abs(${ratings.score} - 5.5) desc,
            ${ratings.updatedAt} desc,
            ${ratings.movieId} desc
        ) as rank
      from ${ratings}
      join ${movies} on ${movies.id} = ${ratings.movieId}
      join ${movieEmbeddings}
        on ${movieEmbeddings.movieId} = ${ratings.movieId}
        and ${movieEmbeddings.model} = ${EMBEDDING_MODEL}
      where ${ratings.userId} = ${userId}::text
    ) ranked
    where (ranked.is_liked and ranked.rank <= ${LIKED_ANCHORS})
      or (not ranked.is_liked and ranked.rank <= ${DISLIKED_ANCHORS})
    union all
    (
      select ${feedFeedback.movieId} as movie_id, null::smallint as score,
        m.title, m.release_year, 'more_like_this' as source
      ${feedbackAnchorFrom}
      join ${movies} m on m.id = ${feedFeedback.movieId}
      ${feedbackAnchorWhere(userId)}
      order by ${feedFeedback.createdAt} desc, ${feedFeedback.movieId} desc
      limit ${MORE_LIKE_THIS_ANCHORS}
    )
  `);

  const rated: RatingAnchor[] = [];
  const asked: MoreLikeThisAnchor[] = [];
  for (const row of anchors.rows) {
    const base = {
      movieId: Number(row.movie_id),
      title: row.title,
      releaseYear: row.release_year,
    };
    if (row.source === "more_like_this" || row.score === null) {
      asked.push({
        ...base,
        weight: MORE_LIKE_THIS_WEIGHT,
        source: "more_like_this",
      });
    } else {
      rated.push({
        ...base,
        score: row.score,
        weight: ratingWeight(row.score),
        source: "rating",
      });
    }
  }
  const byStrength = (a: TasteAnchor, b: TasteAnchor) =>
    Math.abs(b.weight) - Math.abs(a.weight) || b.movieId - a.movieId;

  return {
    likedCount: Number(counts.rows[0]?.liked ?? 0),
    dislikedCount: Number(counts.rows[0]?.disliked ?? 0),
    moreLikeThisCount: Number(counts.rows[0]?.more_like_this ?? 0),
    liked: rated.filter((a) => isLikedScore(a.score)).sort(byStrength),
    disliked: rated.filter((a) => !isLikedScore(a.score)).sort(byStrength),
    // Kept in the query's order: newest first.
    moreLikeThis: asked,
  };
}

import { sql } from "drizzle-orm";
import { EMBEDDING_MODEL } from "@/catalog/embedding/model";
import type { Executor } from "@/db/create-db";
import { movieEmbeddings, movies, ratings } from "@/db/schema";
import { isLikedScore, ratingWeight } from "./rules";
import type { Anchor } from "./types";
import { DISLIKED_ANCHORS, LIKED_ANCHORS } from "./weights";

/** A rated movie used to score candidates: its id, its pull and what a reason needs. */
export type TasteAnchor = Anchor & { weight: number };

export type Taste = {
  /** Liked ratings with a current embedding, not limited to the anchor cap. */
  likedCount: number;
  /** Disliked ratings with a current embedding, not limited to the anchor cap. */
  dislikedCount: number;
  /** Up to `LIKED_ANCHORS` strongest liked ratings, positive weights. */
  liked: TasteAnchor[];
  /** Up to `DISLIKED_ANCHORS` strongest disliked ratings, negative weights. */
  disliked: TasteAnchor[];
};

type CountRow = { liked: string; disliked: string };
type AnchorRow = {
  movie_id: string;
  score: number;
  title: string;
  release_year: number | null;
};

/**
 * Reads the user's taste in two queries: the counts, then the capped anchors.
 * Only ratings whose movie has an embedding for the current model count (a
 * movie the catalog withdrew has none). Anchors carry ids, weights, titles,
 * years and scores only; an embedding is never loaded into Node (AC-5, AC-7).
 * Binds `userId` in both reads (AC-16). Strongest means the largest absolute
 * weight, then the newest `updated_at`, then the highest movie id.
 */
export async function loadTaste(
  executor: Executor,
  userId: string,
): Promise<Taste> {
  const counts = await executor.execute<CountRow>(sql`
    select
      count(*) filter (where ${ratings.score} >= 6) as liked,
      count(*) filter (where ${ratings.score} <= 5) as disliked
    from ${ratings}
    join ${movieEmbeddings}
      on ${movieEmbeddings.movieId} = ${ratings.movieId}
      and ${movieEmbeddings.model} = ${EMBEDDING_MODEL}
    where ${ratings.userId} = ${userId}::text
  `);

  const anchors = await executor.execute<AnchorRow>(sql`
    select ranked.movie_id, ranked.score, ranked.title, ranked.release_year
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
  `);

  const all: TasteAnchor[] = anchors.rows.map((row) => ({
    movieId: Number(row.movie_id),
    title: row.title,
    releaseYear: row.release_year,
    score: row.score,
    weight: ratingWeight(row.score),
  }));
  const byStrength = (a: TasteAnchor, b: TasteAnchor) =>
    Math.abs(b.weight) - Math.abs(a.weight) || b.movieId - a.movieId;

  return {
    likedCount: Number(counts.rows[0]?.liked ?? 0),
    dislikedCount: Number(counts.rows[0]?.disliked ?? 0),
    liked: all.filter((a) => isLikedScore(a.score)).sort(byStrength),
    disliked: all.filter((a) => !isLikedScore(a.score)).sort(byStrength),
  };
}

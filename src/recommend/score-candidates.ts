import { sql } from "drizzle-orm";
import { EMBEDDING_MODEL } from "@/catalog/embedding/model";
import { isListable } from "@/catalog/listable";
import type { Executor } from "@/db/create-db";
import { movies } from "@/db/schema";
import { unavailableMovies } from "@/user-data/exclusions";
import type { TasteAnchor } from "./load-taste";
import { pgArray } from "./pg-array";
import {
  CANDIDATE_FETCH,
  NEGATIVE_WEIGHT,
  PRIOR_FULL_VOTES,
  PRIOR_WEIGHT,
} from "./weights";

/**
 * A candidate with its score and the liked anchor behind it. `score` is
 * internal, so tests can check AC-3 and AC-10; it is not part of a `Pick`.
 */
export type ScoredCandidate = {
  movieId: number;
  anchorId: number;
  score: number;
};

type ScoreRow = { movie_id: string; anchor_id: string; score: number };

/**
 * The one scoring read (spec 0007, AC-3, AC-10, AC-13). It ranks every
 * listable, available, embedded movie not in `shown`, inside Postgres:
 *
 *   score = pos - NEGATIVE_WEIGHT * neg + PRIOR_WEIGHT * prior
 *
 * `pos` is the best `weight * similarity` over the liked anchors (and names the
 * anchor, ties to the lower id). `neg` is the best `|weight| * similarity` over
 * the disliked anchors, never below 0. `prior` is the popularity nudge.
 *
 * The scan is exact on purpose. Never rewrite it as
 * `ORDER BY embedding <=> $vector LIMIT k`: the planner could pick the HNSW
 * index, which is approximate and can lose rows after the filters (spec 0002).
 * The anchors sit in a materialized CTE so each anchor vector is read once.
 * Returns at most `CANDIDATE_FETCH` rows, best first, one query however many
 * anchors there are (AC-17). Needs at least one liked anchor. `liked` holds
 * every positive anchor, rated or "More like this" (spec 0011), and a pair
 * where the anchor is the candidate itself is skipped.
 */
export async function scoreCandidates(
  executor: Executor,
  input: {
    userId: string;
    liked: readonly TasteAnchor[];
    disliked: readonly TasteAnchor[];
    shown: readonly number[];
  },
): Promise<ScoredCandidate[]> {
  const anchors = [...input.liked, ...input.disliked];
  if (input.liked.length === 0) return [];

  const anchorIds = pgArray(anchors.map((a) => a.movieId));
  const anchorWeights = pgArray(anchors.map((a) => a.weight));
  const shown = pgArray(input.shown);

  const result = await executor.execute<ScoreRow>(sql`
    with anchors as materialized (
      select a.movie_id, a.weight, e.embedding
      from unnest(${anchorIds}::bigint[], ${anchorWeights}::float8[])
        as a(movie_id, weight)
      join movie_embeddings e
        on e.movie_id = a.movie_id and e.model = ${EMBEDDING_MODEL}
    ),
    pairs as (
      select
        ${movies.id} as movie_id,
        a.movie_id as anchor_id,
        a.weight as weight,
        a.weight * (1 - (ce.embedding <=> a.embedding)) as product
      from ${movies}
      join movie_embeddings ce
        on ce.movie_id = ${movies.id} and ce.model = ${EMBEDDING_MODEL}
      cross join anchors a
      where ${isListable()}
        -- An anchor never scores itself (spec 0011, AC-7).
        and a.movie_id <> ${movies.id}
        and ${unavailableMovies(input.userId, movies.id, "feed")}
        and ${movies.id} <> all(${shown}::bigint[])
    ),
    pos as (
      select distinct on (movie_id) movie_id, anchor_id, product
      from pairs
      where weight > 0
      order by movie_id, product desc, anchor_id asc
    ),
    neg as (
      select movie_id, greatest(0, max(-product)) as value
      from pairs
      where weight < 0
      group by movie_id
    )
    select
      pos.movie_id,
      pos.anchor_id,
      (
        pos.product
        - ${NEGATIVE_WEIGHT}::float8 * coalesce(neg.value, 0)
        + ${PRIOR_WEIGHT}::float8 * (
          least(1, greatest(0, coalesce(${movies.voteAverage}, 0)::float8 / 10))
          * least(
            1,
            ln(1 + coalesce(${movies.voteCount}, 0)::float8)
              / ln(1 + ${PRIOR_FULL_VOTES}::float8)
          )
        )
      )::float8 as score
    from pos
    join ${movies} on ${movies.id} = pos.movie_id
    left join neg on neg.movie_id = pos.movie_id
    order by score desc, pos.movie_id asc
    limit ${CANDIDATE_FETCH}
  `);

  return result.rows.map((row) => ({
    movieId: Number(row.movie_id),
    anchorId: Number(row.anchor_id),
    score: Number(row.score),
  }));
}

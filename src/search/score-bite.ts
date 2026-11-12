import { sql } from "drizzle-orm";
import { EMBEDDING_MODEL } from "@/catalog/embedding/model";
import { isListable } from "@/catalog/listable";
import type { Executor } from "@/db/create-db";
import { movies } from "@/db/schema";
import type { TasteAnchor } from "@/recommend/load-taste";
import { pgArray } from "@/recommend/pg-array";
import { unavailableMovies } from "@/user-data/exclusions";
import { filtersSql } from "./filters-sql";
import type { PhraseFilters } from "./types";
import { BITE_RESULTS, BITE_TASTE_WEIGHT } from "./weights";

/** A vibe result before its card is read. */
export type BiteCandidate = {
  movieId: number;
  /** The positive anchor with the highest `weight * cosine`, or null with no anchors. */
  bestAnchorId: number | null;
  /** That anchor's raw cosine to the candidate. */
  bestAnchorSimilarity: number | null;
  /** Internal, so tests can check AC-7. Never sent to the client. */
  score: number;
};

type Row = {
  movie_id: string;
  anchor_id: string | null;
  anchor_cosine: number | null;
  score: number;
};

/** A query vector as one `vector` parameter. Callers pass Voyage's finite numbers only. */
const vectorLiteral = (vector: readonly number[]) => `[${vector.join(",")}]`;

/**
 * The vibe mode read (spec 0012, AC-6, AC-7). Every listable, embedded movie
 * the user has not dealt with that passes the filters, scored as
 *
 *   score = cosine(phrase, movie) + BITE_TASTE_WEIGHT * max(weight * cosine(anchor, movie))
 *
 * over the positive anchors, skipping the pair where the anchor is the movie
 * itself. No anchors means the phrase alone. Ties go to the higher vote count,
 * then the lower id. At most `BITE_RESULTS` rows, best first.
 *
 * The scan is exact on purpose, like the recommender: it orders by the blended
 * score, never by `embedding <=> $vector` alone, so the planner cannot pick the
 * approximate HNSW index (spec 0002).
 */
export async function scoreBite(
  executor: Executor,
  input: {
    userId: string;
    vector: readonly number[];
    filters: PhraseFilters;
    anchors: readonly TasteAnchor[];
  },
): Promise<BiteCandidate[]> {
  const anchorIds = pgArray(input.anchors.map((a) => a.movieId));
  const anchorWeights = pgArray(input.anchors.map((a) => a.weight));

  const result = await executor.execute<Row>(sql`
    with anchors as materialized (
      select a.movie_id, a.weight, e.embedding
      from unnest(${anchorIds}::bigint[], ${anchorWeights}::float8[])
        as a(movie_id, weight)
      join movie_embeddings e
        on e.movie_id = a.movie_id and e.model = ${EMBEDDING_MODEL}
    ),
    candidates as materialized (
      select
        ${movies.id} as movie_id,
        ${movies.voteCount} as vote_count,
        ce.embedding,
        1 - (ce.embedding <=> ${vectorLiteral(input.vector)}::vector) as phrase_similarity
      from ${movies}
      join movie_embeddings ce
        on ce.movie_id = ${movies.id} and ce.model = ${EMBEDDING_MODEL}
      where ${isListable()}
        and ${unavailableMovies(input.userId, movies.id, "feed")}
        and ${filtersSql(input.filters)}
    ),
    best as (
      select distinct on (c.movie_id)
        c.movie_id,
        a.movie_id as anchor_id,
        a.weight * (1 - (c.embedding <=> a.embedding)) as product,
        1 - (c.embedding <=> a.embedding) as cosine
      from candidates c
      cross join anchors a
      -- An anchor never scores itself (spec 0011, AC-7).
      where a.movie_id <> c.movie_id
      order by c.movie_id, product desc, a.movie_id asc
    )
    select
      c.movie_id,
      b.anchor_id,
      b.cosine::float8 as anchor_cosine,
      (c.phrase_similarity
        + ${BITE_TASTE_WEIGHT}::float8 * coalesce(b.product, 0))::float8 as score
    from candidates c
    left join best b on b.movie_id = c.movie_id
    order by score desc, c.vote_count desc nulls last, c.movie_id asc
    limit ${BITE_RESULTS}
  `);

  return result.rows.map((row) => ({
    movieId: Number(row.movie_id),
    bestAnchorId: row.anchor_id === null ? null : Number(row.anchor_id),
    bestAnchorSimilarity:
      row.anchor_cosine === null ? null : Number(row.anchor_cosine),
    score: Number(row.score),
  }));
}

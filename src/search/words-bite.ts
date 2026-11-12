import { sql } from "drizzle-orm";
import { isListable } from "@/catalog/listable";
import type { Executor } from "@/db/create-db";
import { movies } from "@/db/schema";
import { unavailableMovies } from "@/user-data/exclusions";
import { filtersSql } from "./filters-sql";
import type { PhraseFilters } from "./types";
import { BITE_RESULTS } from "./weights";

type Row = { movie_id: string };

/**
 * The words mode read (spec 0012, AC-9), used when Voyage cannot embed the
 * phrase. `terms` is the phrase with the word rule matches taken out. It is
 * read as a web search query and its ANDs are turned into ORs, because a mood
 * phrase almost never matches every word. Same filters and exclusions as vibe
 * mode, ranked by `ts_rank`, then vote count, then the lower id, at most
 * `BITE_RESULTS`. No terms left means no results.
 */
export async function wordsBite(
  executor: Executor,
  input: { userId: string; terms: string; filters: PhraseFilters },
): Promise<number[]> {
  if (input.terms.trim() === "") return [];
  const result = await executor.execute<Row>(sql`
    with q as (
      select nullif(
        replace(websearch_to_tsquery('english', ${input.terms}::text)::text, '&', '|'),
        ''
      )::tsquery as query
    )
    select ${movies.id} as movie_id
    from ${movies}, q
    where q.query is not null
      and ${movies.search} @@ q.query
      and ${isListable()}
      and ${unavailableMovies(input.userId, movies.id, "feed")}
      and ${filtersSql(input.filters)}
    order by ts_rank(${movies.search}, q.query) desc,
      ${movies.voteCount} desc nulls last,
      ${movies.id} asc
    limit ${BITE_RESULTS}
  `);
  return result.rows.map((row) => Number(row.movie_id));
}

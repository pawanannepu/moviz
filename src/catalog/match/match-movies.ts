import { sql } from "drizzle-orm";
import { normalizeTitle } from "@/catalog/normalize-title";
import type { Db } from "@/db/create-db";
import { type DbUnavailable, toDbFailure } from "@/db/failure";
import { err, ok, type Result } from "@/lib/result";
import {
  chooseMatch,
  type MatchCandidate,
  type MatchOutcome,
} from "./choose-match";

export type { MatchOutcome } from "./choose-match";

/** One row to match, for example a line of a Letterboxd file. */
export type MatchInput = {
  title: string;
  /** Null or missing means the row cannot be matched. */
  year: number | null;
};

type HitRow = {
  key: string;
  year: number;
  movie_id: number | string;
  release_year: number;
  kind: MatchCandidate["kind"];
};

const NO_MATCH: MatchOutcome = { kind: "no_match" };

/**
 * Turns title plus year rows into catalog movies (spec 0003, AC-4, AC-5). Returns
 * one outcome per input row, in the same order. Callers pass rows they already
 * validated.
 *
 * A row matches when its normalized title equals any stored title key of a movie
 * TMDB still returns, and the movie's release year is the row's year or one year
 * off (Letterboxd and TMDB sometimes differ by one). A poster is not needed.
 * When more than one movie fits, nothing is guessed: see `chooseMatch`. A row with
 * no year, or a title whose key is empty, is `no_match` and never reaches the
 * database. Duplicate rows get the same answer.
 *
 * All rows are resolved in one query however many there are. The (key, year)
 * pairs travel as a single bound JSON parameter.
 */
export async function matchMovies(
  db: Db,
  rows: MatchInput[],
): Promise<Result<MatchOutcome[], DbUnavailable>> {
  const keys = rows.map((row) => {
    const year = row.year;
    if (year === null || !Number.isInteger(year)) return null;
    const key = normalizeTitle(row.title);
    return key === "" ? null : `${year}\u0000${key}`;
  });

  const pairs = new Map<string, { key: string; year: number }>();
  rows.forEach((row, index) => {
    const pairId = keys[index];
    if (pairId !== null && row.year !== null) {
      pairs.set(pairId, { key: normalizeTitle(row.title), year: row.year });
    }
  });
  if (pairs.size === 0) return ok(rows.map(() => NO_MATCH));

  let hits: HitRow[];
  try {
    const result = await db.execute<HitRow>(sql`
      select p.key, p.year, mt.movie_id, m.release_year, mt.kind
      from jsonb_to_recordset(${JSON.stringify([...pairs.values()])}::jsonb)
        as p(key text, year int)
      join movie_titles mt on mt.title_normalized = p.key
      join movies m on m.id = mt.movie_id
      where m.source_missing_at is null
        and m.release_year between p.year - 1 and p.year + 1
    `);
    hits = result.rows;
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }

  const candidatesByPair = new Map<string, MatchCandidate[]>();
  for (const hit of hits) {
    const pairId = `${hit.year}\u0000${hit.key}`;
    const candidate: MatchCandidate = {
      movieId: Number(hit.movie_id),
      releaseYear: hit.release_year,
      kind: hit.kind,
    };
    const list = candidatesByPair.get(pairId);
    if (list) list.push(candidate);
    else candidatesByPair.set(pairId, [candidate]);
  }

  const outcomes = new Map<string, MatchOutcome>();
  for (const [pairId, { year }] of pairs) {
    outcomes.set(pairId, chooseMatch(year, candidatesByPair.get(pairId) ?? []));
  }
  return ok(
    keys.map((pairId) =>
      pairId === null ? NO_MATCH : (outcomes.get(pairId) ?? NO_MATCH),
    ),
  );
}

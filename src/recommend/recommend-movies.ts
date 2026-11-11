import { z } from "zod";
import type { Db, Executor } from "@/db/create-db";
import { toDbFailure, unexpectedDbError } from "@/db/failure";
import { err, ok, type Result } from "@/lib/result";
import { loadPickCards } from "./load-pick-cards";
import { loadTaste } from "./load-taste";
import { popularCandidates } from "./popular-candidates";
import { pickWithVariety, tasteStrength, varietyCap } from "./rules";
import { scoreCandidates } from "./score-candidates";
import type {
  Pick,
  Reason,
  Recommendations,
  RecommendError,
  TasteProfile,
} from "./types";
import { DEFAULT_LIMIT, MAX_LIMIT, MAX_SHOWN } from "./weights";

const inputSchema = z.object({
  userId: z.string().min(1),
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  shown: z
    .array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
    .max(MAX_SHOWN)
    .default([]),
});

export type RecommendInput = {
  userId: string;
  /** 1 to 50, default 20. */
  limit?: number;
  /** Movie ids already on screen, up to 500. Duplicates are removed. */
  shown?: number[];
};

type Chosen = { movieId: number; reason: Reason };

/** The picks in order, with the reason for each, before the cards are read. */
async function choosePicks(
  tx: Executor,
  input: { userId: string; limit: number; shown: number[] },
  taste: Awaited<ReturnType<typeof loadTaste>>,
): Promise<Chosen[]> {
  const popular = async (): Promise<Chosen[]> =>
    (await popularCandidates(tx, input)).map((movieId) => ({
      movieId,
      reason: { kind: "popular" },
    }));

  if (tasteStrength(taste.likedCount) === "none") return popular();

  const scored = await scoreCandidates(tx, {
    userId: input.userId,
    liked: taste.liked,
    disliked: taste.disliked,
    shown: input.shown,
  });
  // No embedded candidate at all (for example embeddings not written yet).
  if (scored.length === 0) return popular();

  const anchors = new Map(taste.liked.map((a) => [a.movieId, a]));
  const cap = varietyCap(input.limit, taste.liked.length);
  return pickWithVariety(scored, input.limit, cap).flatMap((candidate) => {
    const anchor = anchors.get(candidate.anchorId);
    if (!anchor) return [];
    const { weight: _weight, ...shownAnchor } = anchor;
    return [
      {
        movieId: candidate.movieId,
        reason: { kind: "similar_to_liked", anchor: shownAnchor },
      },
    ];
  });
}

/**
 * Ranks movies the user has not dealt with, closest to the movies they liked,
 * and says which liked movie each pick came from (spec 0007). Computed on read:
 * nothing about taste is stored. The caller passes the user id from the live
 * session and, for "load more", the movie ids already shown.
 *
 * - No liked movie with an embedding: the most voted movies, reason `popular`.
 * - Otherwise: taste picks, reason `similar_to_liked`; `profile.strength` is
 *   `thin` below 5 liked movies, which only changes the flag the feed reads.
 *
 * Every read runs in one read only `REPEATABLE READ` transaction, so counts,
 * anchors, scores and reasons come from one snapshot. Returns `invalid_input`
 * for a bad argument and `db_unavailable` when the database cannot be reached;
 * any other error is a bug and is thrown again as a clean error that holds no
 * ids, scores or query parameters (`unexpectedDbError`). It reads only this user's ratings
 * and public catalog rows, and never logs rating content.
 */
export async function recommendMovies(
  db: Db,
  input: RecommendInput,
): Promise<Result<Recommendations, RecommendError>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return err({ code: "invalid_input" });
  const { userId, limit } = parsed.data;
  const shown = [...new Set(parsed.data.shown)];

  try {
    const value = await db.transaction(
      async (tx): Promise<Recommendations> => {
        const taste = await loadTaste(tx, userId);
        const profile: TasteProfile = {
          likedCount: taste.likedCount,
          dislikedCount: taste.dislikedCount,
          strength: tasteStrength(taste.likedCount),
        };
        const chosen = await choosePicks(tx, { userId, limit, shown }, taste);
        const cards = await loadPickCards(
          tx,
          chosen.map((pick) => pick.movieId),
        );
        const reasons = new Map(chosen.map((c) => [c.movieId, c.reason]));
        const picks: Pick[] = cards.flatMap((movie) => {
          const reason = reasons.get(movie.id);
          return reason ? [{ movie, reason }] : [];
        });
        return { picks, profile };
      },
      { accessMode: "read only", isolationLevel: "repeatable read" },
    );
    return ok(value);
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw unexpectedDbError("recommendMovies", error);
  }
}

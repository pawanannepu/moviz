import type { VoyageClient } from "@/catalog/embedding/voyage-client";
import type { Db } from "@/db/create-db";
import { toDbFailure, unexpectedDbError } from "@/db/failure";
import { err, ok, type Result } from "@/lib/result";
import { loadPickCards } from "@/recommend/load-pick-cards";
import { loadTaste, positiveAnchors } from "@/recommend/load-taste";
import { parsePhrase, phraseWithoutRuleWords } from "./parse-phrase";
import { consumeSearchQuota } from "./quota";
import { scoreBite } from "./score-bite";
import type {
  BiteAnchor,
  BiteMode,
  BitePick,
  BiteReason,
  BiteSearchError,
  BiteSearchResult,
} from "./types";
import {
  BITE_ANCHOR_MIN_SIMILARITY,
  SEARCH_TIME_BUDGET_MS,
  VOYAGE_QUERY_TIMEOUT_MS,
} from "./weights";
import { wordsBite } from "./words-bite";

export type BiteSearchDeps = {
  db: Db;
  /** Null when `VOYAGE_API_KEY` is not set: every search runs in words mode. */
  voyage: VoyageClient | null;
  /** Replaceable for tests. Milliseconds since the epoch. */
  now?: () => number;
  /** Replaceable for tests. Resolves after `ms`. */
  wait?: (ms: number) => Promise<void>;
};

const defaultWait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Embeds the phrase within `limitMs`, or returns null for words mode. One try,
 * raced against the limit, so a Voyage call that never answers still falls back
 * on time (AC-10). Never throws, and never puts the phrase in an error.
 */
async function embedPhrase(
  voyage: VoyageClient | null,
  phrase: string,
  limitMs: number,
  wait: (ms: number) => Promise<void>,
): Promise<number[] | null> {
  if (!voyage || limitMs <= 0) return null;
  const call = voyage
    .embedQuery(phrase, { timeoutMs: limitMs })
    .then((result) => (result.ok ? result.value : null))
    .catch(() => null);
  const timeout = wait(limitMs).then(() => null);
  return Promise.race([call, timeout]);
}

type Chosen = { movieId: number; reason: BiteReason };

/**
 * One bite search for the signed in user (spec 0012). In order: spend one unit
 * of the daily quota (a refusal stops here, and a charge is never refunded),
 * read the word rules, embed the phrase with Voyage (vibe mode) or fall back to
 * full text search (words mode), then score and read the cards in one read
 * only `REPEATABLE READ` transaction, after the quota statement committed.
 *
 * The caller passes the user id from the live session and an already
 * validated phrase. The phrase goes only to Voyage; it is never stored or
 * logged. Returns `quota_exceeded`, `user_not_found` or `db_unavailable`; any
 * other error is a bug, thrown again as a clean error (`unexpectedDbError`).
 */
export async function runBiteSearch(
  deps: BiteSearchDeps,
  input: { userId: string; phrase: string },
): Promise<Result<BiteSearchResult, BiteSearchError>> {
  const now = deps.now ?? Date.now;
  const started = now();
  const { userId, phrase } = input;

  const quota = await consumeSearchQuota(deps.db, { userId });
  if (!quota.ok) return err(quota.error);

  const currentYear = new Date(now()).getUTCFullYear();
  const filters = parsePhrase(phrase, { currentYear });

  const budgetLeft = SEARCH_TIME_BUDGET_MS - (now() - started);
  const vector = await embedPhrase(
    deps.voyage,
    phrase,
    Math.min(VOYAGE_QUERY_TIMEOUT_MS, budgetLeft),
    deps.wait ?? defaultWait,
  );
  const mode: BiteMode = vector ? "vibe" : "words";

  try {
    const picks = await deps.db.transaction(
      async (tx): Promise<BitePick[]> => {
        let chosen: Chosen[];
        if (vector) {
          const taste = await loadTaste(tx, userId);
          const anchors = positiveAnchors(taste);
          const byId = new Map(anchors.map((a) => [a.movieId, a]));
          const scored = await scoreBite(tx, {
            userId,
            vector,
            filters,
            anchors,
          });
          chosen = scored.map((candidate) => {
            const best =
              candidate.bestAnchorId === null
                ? undefined
                : byId.get(candidate.bestAnchorId);
            const named =
              best &&
              candidate.bestAnchorSimilarity !== null &&
              candidate.bestAnchorSimilarity >= BITE_ANCHOR_MIN_SIMILARITY;
            const anchor: BiteAnchor | null = named
              ? {
                  movieId: best.movieId,
                  title: best.title,
                  releaseYear: best.releaseYear,
                }
              : null;
            return {
              movieId: candidate.movieId,
              reason: { kind: "bite_vibe", phrase, anchor },
            };
          });
        } else {
          const ids = await wordsBite(tx, {
            userId,
            terms: phraseWithoutRuleWords(phrase, { currentYear }),
            filters,
          });
          chosen = ids.map((movieId) => ({
            movieId,
            reason: { kind: "bite_words", phrase },
          }));
        }

        const cards = await loadPickCards(
          tx,
          chosen.map((c) => c.movieId),
        );
        const reasons = new Map(chosen.map((c) => [c.movieId, c.reason]));
        return cards.flatMap((movie) => {
          const reason = reasons.get(movie.id);
          return reason ? [{ movie, reason }] : [];
        });
      },
      { accessMode: "read only", isolationLevel: "repeatable read" },
    );
    return ok({ mode, filters, picks });
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw unexpectedDbError("runBiteSearch", error);
  }
}

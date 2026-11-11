import type { Db } from "@/db/create-db";
import type { DbUnavailable } from "@/db/failure";
import { err, ok, type Result } from "@/lib/result";
import { recommendMovies } from "@/recommend/recommend-movies";
import { MAX_SHOWN } from "@/recommend/weights";
import { FEED_BATCH_SIZE } from "./constants";
import { reasonSentence } from "./reason-sentence";
import type { FeedBatch } from "./types";

/**
 * Reads one batch of feed picks with exactly one recommender call and words
 * each reason (spec 0008). `shown` is the movie ids already on the page: empty
 * for the first load. The caller has already checked the user, because this
 * function trusts `userId`.
 *
 * `done` is true when the batch is short, or when the page would hold more than
 * `MAX_SHOWN` distinct movies after it, because the next request could not
 * send them all. An `invalid_input` from the recommender is a bug in this
 * feature, so it is thrown with a message that holds no data.
 */
export async function loadFeedBatch(
  db: Db,
  input: { userId: string; shown: number[] },
): Promise<Result<FeedBatch, DbUnavailable>> {
  const result = await recommendMovies(db, {
    userId: input.userId,
    limit: FEED_BATCH_SIZE,
    shown: input.shown,
  });
  if (!result.ok) {
    if (result.error.code === "db_unavailable") return err(result.error);
    throw new Error("The feed sent the recommender an invalid input.");
  }
  const picks = result.value.picks.map((pick) => ({
    movie: pick.movie,
    reason: reasonSentence(pick.reason),
  }));
  const pageSize = new Set(input.shown).size + picks.length;
  return ok({
    picks,
    strength: result.value.profile.strength,
    done: picks.length < FEED_BATCH_SIZE || pageSize > MAX_SHOWN,
  });
}

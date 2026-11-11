"use server";

import { z } from "zod";
import { getUserForAction } from "@/auth/session";
import { db } from "@/db/client";
import { err, ok, type Result } from "@/lib/result";
import { MAX_SHOWN } from "@/recommend/weights";
import { loadFeedBatch } from "./load-feed-batch";
import type { FeedPick } from "./types";

/*
 * The feed's one Server Action (spec 0008). It reads the user from the live
 * session, validates its input with Zod, returns a typed result and never
 * redirects or throws for an expected failure. It logs nothing: no rating,
 * title, score or movie id leaves this file except in the result the signed in
 * user asked for (AC-14).
 */

const inputSchema = z.object({
  shown: z
    .array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
    .max(MAX_SHOWN),
});

export type LoadMoreResult = Result<
  { picks: FeedPick[]; done: boolean },
  { code: "unauthenticated" | "invalid_input" | "db_unavailable" }
>;

/**
 * Returns the next batch of picks for the signed in user, skipping the movie
 * ids already on the page. The user id comes from the session only: any
 * `userId` in the input is ignored. Returns the finished reason sentences, so
 * the browser never builds a reason from raw rating data.
 */
export async function loadMoreAction(input: unknown): Promise<LoadMoreResult> {
  const session = await getUserForAction();
  if (!session.ok) return err({ code: "unauthenticated" });
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return err({ code: "invalid_input" });

  const batch = await loadFeedBatch(db, {
    userId: session.user.id,
    shown: parsed.data.shown,
  });
  if (!batch.ok) return err({ code: "db_unavailable" });
  return ok({ picks: batch.value.picks, done: batch.value.done });
}

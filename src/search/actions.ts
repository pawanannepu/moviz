"use server";

import { z } from "zod";
import { getUserForAction } from "@/auth/session";
import { createVoyageClient } from "@/catalog/embedding/voyage-client";
import { db } from "@/db/client";
import { env } from "@/env";
import { err, ok, type Result } from "@/lib/result";
import { getProfile } from "@/profile/profile";
import { checkPhrase, type PhraseProblem } from "./phrase";
import { runBiteSearch } from "./run-bite-search";
import type { BiteSearchResult } from "./types";

/*
 * The one Server Action of bite search (spec 0012, AC-14). It reads the user
 * from the live session, validates with Zod, returns a typed result and never
 * redirects or throws for an expected failure. It logs nothing: the phrase, a
 * movie id, a title or a score never leave this file except in the result the
 * signed in user asked for, and the phrase goes to Voyage (AC-15).
 */

const inputSchema = z.object({ phrase: z.string().max(2_000) });

export type BiteSearchActionError =
  | { code: "unauthenticated" }
  | { code: "invalid_input"; reason: PhraseProblem | "bad_shape" }
  | { code: "not_onboarded" }
  | { code: "quota_exceeded"; resetsAt: string }
  | { code: "db_unavailable" };

export type BiteSearchActionResult = Result<
  BiteSearchResult,
  BiteSearchActionError
>;

/**
 * Runs one bite search for the signed in user. Checks, in order: the session,
 * the input, onboarding, then the daily quota (inside `runBiteSearch`). A
 * refused phrase spends no quota. The user id comes from the session only.
 */
export async function biteSearchAction(
  input: unknown,
): Promise<BiteSearchActionResult> {
  const session = await getUserForAction();
  if (!session.ok) return err({ code: "unauthenticated" });

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return err({ code: "invalid_input", reason: "bad_shape" });
  }
  const checked = checkPhrase(parsed.data.phrase);
  if (!checked.ok) {
    return err({ code: "invalid_input", reason: checked.problem });
  }

  const userId = session.user.id;
  const profile = await getProfile(db, { userId });
  if (!profile.ok) {
    return err({
      code:
        profile.error.code === "user_not_found"
          ? "unauthenticated"
          : "db_unavailable",
    });
  }
  if (!profile.value.onboardedAt) return err({ code: "not_onboarded" });

  const voyage = env.VOYAGE_API_KEY
    ? createVoyageClient({ apiKey: env.VOYAGE_API_KEY })
    : null;
  const result = await runBiteSearch(
    { db, voyage },
    { userId, phrase: checked.phrase },
  );
  if (result.ok) return ok(result.value);
  switch (result.error.code) {
    case "quota_exceeded":
      return err({ code: "quota_exceeded", resetsAt: result.error.resetsAt });
    case "user_not_found":
      return err({ code: "unauthenticated" });
    case "db_unavailable":
      return err({ code: "db_unavailable" });
  }
}

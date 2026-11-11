"use server";

import { z } from "zod";
import { getUserForAction } from "@/auth/session";
import { db } from "@/db/client";
import { err, ok, type Result } from "@/lib/result";
import { listUnmatched, type UnmatchedPage } from "./list-unmatched";

/*
 * The one Server Action of the import page (spec 0009, AC-11, AC-12): the next
 * page of the not matched list. It reads the user from the live session,
 * validates its input with Zod, returns a typed result and reads only rows of an
 * import that belongs to that user. It logs nothing and returns no more than the
 * rows asked for.
 */

const inputSchema = z.object({
  importId: z.number().int().positive(),
  after: z.string().min(1).max(200).nullable(),
});

export type LoadMoreUnmatchedResult = Result<
  UnmatchedPage,
  {
    code:
      | "unauthenticated"
      | "invalid_input"
      | "invalid_cursor"
      | "not_found"
      | "db_unavailable";
  }
>;

/** Returns the page of not matched rows after `after` for one of the signed in user's imports. */
export async function loadMoreUnmatchedAction(
  input: unknown,
): Promise<LoadMoreUnmatchedResult> {
  const session = await getUserForAction();
  if (!session.ok) return err({ code: "unauthenticated" });
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return err({ code: "invalid_input" });

  const page = await listUnmatched(db, {
    userId: session.user.id,
    importId: parsed.data.importId,
    after: parsed.data.after,
  });
  return page.ok ? ok(page.value) : err(page.error);
}

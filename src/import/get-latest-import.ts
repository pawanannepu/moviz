import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import {
  type DbUnavailable,
  toDbFailure,
  unexpectedDbError,
} from "@/db/failure";
import { imports } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import { listUnmatched, type UnmatchedPage } from "./list-unmatched";

/** The user's newest saved import, whatever its status, with the first page of its not matched rows. */
export type LatestImport = {
  id: number;
  status: "completed" | "failed";
  rowsTotal: number;
  rowsMatched: number;
  rowsUnmatched: number;
  firstPage: UnmatchedPage;
};

/**
 * Reads what `/import` shows under the form (spec 0009, AC-2): the latest import
 * of any status, or null when the user has none. A `failed` import has no
 * unmatched rows, so its list is empty. Only this user's rows are read.
 */
export async function getLatestImport(
  db: Db,
  input: { userId: string },
): Promise<Result<LatestImport | null, DbUnavailable>> {
  try {
    const [latest] = await db
      .select()
      .from(imports)
      .where(eq(imports.userId, input.userId))
      .orderBy(desc(imports.createdAt), desc(imports.id))
      .limit(1);
    if (!latest) return ok(null);

    const firstPage: UnmatchedPage =
      latest.status === "failed"
        ? { rows: [], nextCursor: null }
        : await firstPageOf(db, input.userId, latest.id);

    return ok({
      id: latest.id,
      status: latest.status,
      rowsTotal: latest.rowsTotal,
      rowsMatched: latest.rowsMatched,
      rowsUnmatched: latest.rowsUnmatched,
      firstPage,
    });
  } catch (error) {
    if (error instanceof PageUnavailable)
      return err({ code: "db_unavailable" });
    if (toDbFailure(error)?.code === "db_unavailable") {
      return err({ code: "db_unavailable" });
    }
    throw unexpectedDbError("getLatestImport", error);
  }
}

class PageUnavailable extends Error {}

async function firstPageOf(
  db: Db,
  userId: string,
  importId: number,
): Promise<UnmatchedPage> {
  const page = await listUnmatched(db, { userId, importId });
  if (page.ok) return page.value;
  // The import was pruned between the two reads: show it as having no rows.
  if (page.error.code === "not_found") return { rows: [], nextCursor: null };
  throw new PageUnavailable();
}

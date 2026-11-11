import { and, asc, eq, gt } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import {
  type DbUnavailable,
  toDbFailure,
  unexpectedDbError,
} from "@/db/failure";
import { imports, importUnmatchedRows } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import { UNMATCHED_PAGE_SIZE } from "./constants";
import type { UnmatchedReason } from "./row-rules";
import {
  decodeUnmatchedCursor,
  encodeUnmatchedCursor,
  type InvalidUnmatchedCursor,
} from "./unmatched-cursor";

/** One row of the not matched list, as the page shows it. */
export type UnmatchedPageRow = {
  rowNumber: number;
  title: string;
  year: number | null;
  reason: UnmatchedReason;
};

export type UnmatchedPage = {
  rows: UnmatchedPageRow[];
  /** Pass it back as `after` for the next page; null on the last page. */
  nextCursor: string | null;
};

export type ListUnmatchedError =
  | InvalidUnmatchedCursor
  | { code: "not_found" }
  | DbUnavailable;

/**
 * One page of the rows an import left out, in file order (spec 0009, AC-11,
 * AC-12). The import must belong to `userId`; any other id, or one that was
 * pruned while the user paged, is `not_found`, and the answer is the same for
 * both so one user cannot tell another's import exists. Any import the user
 * owns can be paged, not only the latest.
 */
export async function listUnmatched(
  db: Db,
  input: { userId: string; importId: number; after?: string | null },
): Promise<Result<UnmatchedPage, ListUnmatchedError>> {
  let afterRow = 0;
  if (input.after) {
    const decoded = decodeUnmatchedCursor(input.after);
    if (!decoded.ok) return err(decoded.error);
    afterRow = decoded.value;
  }

  try {
    const [owned] = await db
      .select({ id: imports.id })
      .from(imports)
      .where(
        and(eq(imports.id, input.importId), eq(imports.userId, input.userId)),
      );
    if (!owned) return err({ code: "not_found" });

    const rows = await db
      .select({
        rowNumber: importUnmatchedRows.rowNumber,
        title: importUnmatchedRows.title,
        year: importUnmatchedRows.year,
        reason: importUnmatchedRows.reason,
      })
      .from(importUnmatchedRows)
      .where(
        and(
          eq(importUnmatchedRows.importId, input.importId),
          gt(importUnmatchedRows.rowNumber, afterRow),
        ),
      )
      .orderBy(asc(importUnmatchedRows.rowNumber))
      .limit(UNMATCHED_PAGE_SIZE + 1);

    const page = rows.slice(0, UNMATCHED_PAGE_SIZE);
    const last = page[page.length - 1];
    return ok({
      rows: page,
      nextCursor:
        rows.length > UNMATCHED_PAGE_SIZE && last
          ? encodeUnmatchedCursor(last.rowNumber)
          : null,
    });
  } catch (error) {
    if (toDbFailure(error)?.code === "db_unavailable") {
      return err({ code: "db_unavailable" });
    }
    throw unexpectedDbError("listUnmatched", error);
  }
}

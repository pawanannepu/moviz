import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { imports, importUnmatchedRows } from "@/db/schema";
import { TEST_DATABASE_URL, useTestDb } from "@/test-support/test-db";
import { getLatestImport } from "./get-latest-import";

// Spec 0009, AC-2: what /import shows under the form is the user's newest saved
// import, whatever its status, with the first 50 not matched rows.
describe.skipIf(!TEST_DATABASE_URL)("getLatestImport (database)", () => {
  const t = useTestDb();

  async function addImport(
    userId: string,
    input: {
      status?: "completed" | "failed";
      unmatched?: number;
      hoursAgo?: number;
    } = {},
  ) {
    const unmatchedCount = input.unmatched ?? 0;
    const [row] = await t.db
      .insert(imports)
      .values({
        userId,
        status: input.status ?? "completed",
        rowsTotal: unmatchedCount + 4,
        rowsMatched: input.status === "failed" ? 0 : 4,
        rowsUnmatched: input.status === "failed" ? 0 : unmatchedCount,
        createdAt: sql`now() - ${input.hoursAgo ?? 0} * interval '1 hour'`,
      })
      .returning({ id: imports.id });
    if (unmatchedCount > 0 && input.status !== "failed") {
      await t.db.insert(importUnmatchedRows).values(
        Array.from({ length: unmatchedCount }, (_, i) => ({
          importId: row.id,
          rowNumber: i + 1,
          title: `Row ${i + 1}`,
          year: null,
          score: null,
          reason: "no_match" as const,
        })),
      );
    }
    return row.id;
  }

  it("returns null for a user who has never imported", async () => {
    const user = await t.fx.newUser();
    expect(await getLatestImport(t.db, { userId: user.id })).toEqual({
      ok: true,
      value: null,
    });
  });

  it("returns the newest import with its counts and the first page of unmatched rows (AC-2)", async () => {
    const user = await t.fx.newUser();
    await addImport(user.id, { unmatched: 2, hoursAgo: 5 });
    const newest = await addImport(user.id, { unmatched: 60 });

    const result = await getLatestImport(t.db, { userId: user.id });

    expect(result.ok).toBe(true);
    if (!result.ok || !result.value) throw new Error("expected an import");
    expect(result.value).toMatchObject({
      id: newest,
      status: "completed",
      rowsTotal: 64,
      rowsMatched: 4,
      rowsUnmatched: 60,
    });
    expect(result.value.firstPage.rows).toHaveLength(50);
    expect(result.value.firstPage.rows[0].rowNumber).toBe(1);
    expect(result.value.firstPage.nextCursor).not.toBeNull();
  });

  it("returns a failed import as the latest, with no rows, when it is the newest", async () => {
    const user = await t.fx.newUser();
    await addImport(user.id, { unmatched: 3, hoursAgo: 2 });
    const failed = await addImport(user.id, { status: "failed" });

    const result = await getLatestImport(t.db, { userId: user.id });

    expect(result).toMatchObject({
      ok: true,
      value: {
        id: failed,
        status: "failed",
        firstPage: { rows: [], nextCursor: null },
      },
    });
  });

  it("returns an empty list for a completed import that left no rows out", async () => {
    const user = await t.fx.newUser();
    await addImport(user.id, { unmatched: 0 });
    const result = await getLatestImport(t.db, { userId: user.id });
    expect(result).toMatchObject({
      ok: true,
      value: { rowsUnmatched: 0, firstPage: { rows: [], nextCursor: null } },
    });
  });

  it("never returns another user's import (AC-12)", async () => {
    const [mine, theirs] = [await t.fx.newUser(), await t.fx.newUser()];
    await addImport(theirs.id, { unmatched: 5 });
    expect(await getLatestImport(t.db, { userId: mine.id })).toEqual({
      ok: true,
      value: null,
    });
  });
});

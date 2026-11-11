import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { imports, importUnmatchedRows } from "@/db/schema";
import {
  TEST_DATABASE_URL,
  UNKNOWN_USER_ID,
  useTestDb,
} from "@/test-support/test-db";
import { listUnmatched } from "./list-unmatched";
import { encodeUnmatchedCursor } from "./unmatched-cursor";

// Spec 0009, AC-11 and AC-12: the not matched list pages by row number and only
// ever reads rows of an import the user owns.
describe.skipIf(!TEST_DATABASE_URL)("listUnmatched (database)", () => {
  const t = useTestDb();

  async function importWithRows(userId: string, rowCount: number) {
    const [row] = await t.db
      .insert(imports)
      .values({
        userId,
        status: "completed",
        rowsTotal: rowCount,
        rowsMatched: 0,
        rowsUnmatched: rowCount,
      })
      .returning({ id: imports.id });
    if (rowCount > 0) {
      await t.db.insert(importUnmatchedRows).values(
        Array.from({ length: rowCount }, (_, i) => ({
          importId: row.id,
          rowNumber: i + 1,
          title: `Row ${i + 1}`,
          year: 1990 + (i % 30),
          score: 6,
          reason: "no_match" as const,
        })),
      );
    }
    return row.id;
  }

  async function allPages(userId: string, importId: number) {
    const sizes: number[] = [];
    const numbers: number[] = [];
    let after: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const page = await listUnmatched(t.db, { userId, importId, after });
      if (!page.ok) throw new Error(page.error.code);
      sizes.push(page.value.rows.length);
      numbers.push(...page.value.rows.map((r) => r.rowNumber));
      after = page.value.nextCursor;
      if (!after) break;
    }
    return { sizes, numbers };
  }

  it("pages 130 rows as 50, 50 and 30 without skipping or repeating a row (AC-11)", async () => {
    const user = await t.fx.newUser();
    const importId = await importWithRows(user.id, 130);

    const { sizes, numbers } = await allPages(user.id, importId);

    expect(sizes).toEqual([50, 50, 30]);
    expect(numbers).toEqual(Array.from({ length: 130 }, (_, i) => i + 1));
  });

  it("returns no next cursor when the rows fit on one page, including exactly 50 (AC-11)", async () => {
    const user = await t.fx.newUser();
    for (const count of [3, 50]) {
      const importId = await importWithRows(user.id, count);
      const page = await listUnmatched(t.db, { userId: user.id, importId });
      expect(page).toMatchObject({ ok: true, value: { nextCursor: null } });
      if (page.ok) expect(page.value.rows).toHaveLength(count);
    }
  });

  it("returns an empty page for an import with no unmatched rows", async () => {
    const user = await t.fx.newUser();
    const importId = await importWithRows(user.id, 0);
    expect(await listUnmatched(t.db, { userId: user.id, importId })).toEqual({
      ok: true,
      value: { rows: [], nextCursor: null },
    });
  });

  it("returns each row's number, title, year and reason", async () => {
    const user = await t.fx.newUser();
    const importId = await importWithRows(user.id, 2);
    const page = await listUnmatched(t.db, { userId: user.id, importId });
    expect(page).toEqual({
      ok: true,
      value: {
        rows: [
          { rowNumber: 1, title: "Row 1", year: 1990, reason: "no_match" },
          { rowNumber: 2, title: "Row 2", year: 1991, reason: "no_match" },
        ],
        nextCursor: null,
      },
    });
  });

  it("pages an older import, not only the latest (AC-11)", async () => {
    const user = await t.fx.newUser();
    const older = await importWithRows(user.id, 70);
    await importWithRows(user.id, 5);

    const { sizes } = await allPages(user.id, older);

    expect(sizes).toEqual([50, 20]);
  });

  it("answers not_found for another user's import, the same as for one that does not exist (AC-12)", async () => {
    const [owner, other] = [await t.fx.newUser(), await t.fx.newUser()];
    const importId = await importWithRows(owner.id, 10);

    const theirs = await listUnmatched(t.db, { userId: other.id, importId });
    const missing = await listUnmatched(t.db, {
      userId: owner.id,
      importId: 4_503_599_627_370_000,
    });

    expect(theirs).toEqual({ ok: false, error: { code: "not_found" } });
    expect(missing).toEqual(theirs);
  });

  it("answers not_found for a user id that does not exist", async () => {
    const user = await t.fx.newUser();
    const importId = await importWithRows(user.id, 1);
    expect(
      await listUnmatched(t.db, { userId: UNKNOWN_USER_ID, importId }),
    ).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("refuses a cursor it did not make as invalid_cursor, before reading anything (AC-11)", async () => {
    const user = await t.fx.newUser();
    const importId = await importWithRows(user.id, 60);
    expect(
      await listUnmatched(t.db, {
        userId: user.id,
        importId,
        after: "garbage",
      }),
    ).toEqual({ ok: false, error: { code: "invalid_cursor" } });
  });

  it("ignores a cursor that points past the last row and returns an empty last page", async () => {
    const user = await t.fx.newUser();
    const importId = await importWithRows(user.id, 10);
    const page = await listUnmatched(t.db, {
      userId: user.id,
      importId,
      after: encodeUnmatchedCursor(500),
    });
    expect(page).toEqual({ ok: true, value: { rows: [], nextCursor: null } });
  });

  it("stops serving rows once the import is pruned while the user is paging (AC-10)", async () => {
    const user = await t.fx.newUser();
    const importId = await importWithRows(user.id, 120);
    const first = await listUnmatched(t.db, { userId: user.id, importId });
    if (!first.ok) throw new Error("first page failed");
    await t.db.delete(imports).where(eq(imports.id, importId));

    const next = await listUnmatched(t.db, {
      userId: user.id,
      importId,
      after: first.value.nextCursor,
    });

    expect(next).toEqual({ ok: false, error: { code: "not_found" } });
  });
});

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "@/db/create-db";
import { searchUsage } from "@/db/schema";
import {
  TEST_DATABASE_URL,
  UNKNOWN_USER_ID,
  useTestDb,
} from "@/test-support/test-db";
import { consumeSearchQuota } from "./quota";

// Spec 0012, AC-3 (and spec 0002, AC-11): one atomic charge per search, at most
// 30 per user per UTC day, refused with the next UTC midnight.
describe.skipIf(!TEST_DATABASE_URL)("consumeSearchQuota (database)", () => {
  const t = useTestDb();

  /** Today and tomorrow as the database sees them, in UTC. */
  async function utcDays() {
    const result = await t.db.execute<{ today: string; tomorrow: string }>(
      sql`select (now() at time zone 'utc')::date::text as today,
        ((now() at time zone 'utc')::date + 1)::text as tomorrow`,
    );
    return result.rows[0];
  }

  async function rowsFor(userId: string) {
    return t.db
      .select()
      .from(searchUsage)
      .where(eq(searchUsage.userId, userId));
  }

  it("charges one search on today's UTC row and says how many are left", async () => {
    const user = await t.fx.newUser();
    const { today } = await utcDays();

    const result = await consumeSearchQuota(t.db, { userId: user.id });

    expect(result).toEqual({ ok: true, value: { remaining: 29 } });
    expect(await rowsFor(user.id)).toEqual([
      { userId: user.id, day: today, count: 1 },
    ]);
  });

  it("lets exactly 30 of 40 searches at once through, never counting past 30", async () => {
    const user = await t.fx.newUser();

    const results = await Promise.all(
      Array.from({ length: 40 }, () =>
        consumeSearchQuota(t.db, { userId: user.id }),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(30);
    expect((await rowsFor(user.id))[0].count).toBe(30);
  });

  it("refuses the 31st search with the next UTC midnight as resetsAt", async () => {
    const user = await t.fx.newUser();
    const { today, tomorrow } = await utcDays();
    await t.db
      .insert(searchUsage)
      .values({ userId: user.id, day: today, count: 30 });

    const result = await consumeSearchQuota(t.db, { userId: user.id });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "quota_exceeded",
        resetsAt: `${tomorrow}T00:00:00.000Z`,
      },
    });
    expect((await rowsFor(user.id))[0].count).toBe(30);
  });

  it("starts a new count on a new UTC day, leaving yesterday's row alone", async () => {
    const user = await t.fx.newUser();
    await t.db
      .insert(searchUsage)
      .values({ userId: user.id, day: "2020-01-01", count: 30 });

    const result = await consumeSearchQuota(t.db, { userId: user.id });

    expect(result.ok).toBe(true);
    const counts = (await rowsFor(user.id)).map((row) => row.count).sort();
    expect(counts).toEqual([1, 30]);
  });

  it("counts each user on their own", async () => {
    const [first, second] = [await t.fx.newUser(), await t.fx.newUser()];
    const { today } = await utcDays();
    await t.db
      .insert(searchUsage)
      .values({ userId: first.id, day: today, count: 30 });

    const result = await consumeSearchQuota(t.db, { userId: second.id });

    expect(result).toEqual({ ok: true, value: { remaining: 29 } });
  });

  it("returns user_not_found for a user that does not exist", async () => {
    const result = await consumeSearchQuota(t.db, { userId: UNKNOWN_USER_ID });

    expect(result).toEqual({ ok: false, error: { code: "user_not_found" } });
  });
});

describe("consumeSearchQuota when the database is down", () => {
  it("returns db_unavailable", async () => {
    const down = createDb("postgres://nobody:x@127.0.0.1:1/none");
    try {
      const result = await consumeSearchQuota(down.db, { userId: "user-1" });

      expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
    } finally {
      await down.pool.end();
    }
  });
});

import { inArray, like, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "@/db/create-db";
import { rateLimit, searchUsage, session, verification } from "@/db/schema";
import { TEST_DATABASE_URL, token, useTestDb } from "@/test-support/test-db";
import {
  EXPIRED_AUTH_KEEP_DAYS,
  purgeOldRows,
  RATE_LIMIT_KEEP_DAYS,
  SEARCH_USAGE_KEEP_DAYS,
} from "./purge-old-rows";

// Spec 0012, AC-16: the daily purge of rows that no longer serve a purpose.
// The test branch is shared, so the counts are at least this file's rows, and
// the checks look only at the rows this file made.
const DAY = 86_400_000;

describe("purge keep periods (AC-16)", () => {
  it("pins the keep periods spec 0014's policy reads", () => {
    expect([
      SEARCH_USAGE_KEEP_DAYS,
      RATE_LIMIT_KEEP_DAYS,
      EXPIRED_AUTH_KEEP_DAYS,
    ]).toEqual([30, 1, 1]);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("purgeOldRows (database)", () => {
  const t = useTestDb();

  /** A UTC date string `days` before today. */
  async function utcDayAgo(days: number): Promise<string> {
    const result = await t.db.execute<{ day: string }>(
      sql`select ((now() at time zone 'utc')::date - ${days}::int)::text as day`,
    );
    return result.rows[0].day;
  }

  it("deletes search usage older than 30 UTC days and keeps day 30 and newer", async () => {
    const user = await t.fx.newUser();
    const [day31, day30, today] = [
      await utcDayAgo(31),
      await utcDayAgo(30),
      await utcDayAgo(0),
    ];
    await t.db.insert(searchUsage).values([
      { userId: user.id, day: day31, count: 3 },
      { userId: user.id, day: day30, count: 2 },
      { userId: user.id, day: today, count: 1 },
    ]);

    const result = await purgeOldRows(t.db, { now: Date.now() });

    expect(result.ok && result.value.searchUsage).toBeGreaterThanOrEqual(1);
    const left = await t.db.execute<{ day: string }>(
      sql`select day::text from search_usage where user_id = ${user.id} order by day`,
    );
    expect(left.rows.map((row) => row.day)).toEqual([day30, today]);
  });

  it("deletes rate limit rows whose last request is over a day old", async () => {
    const run = `purge-${token()}`;
    const now = Date.now();
    await t.db.insert(rateLimit).values([
      {
        id: `${run}-old`,
        key: `${run}-old`,
        count: 1,
        lastRequest: now - DAY - 1000,
      },
      {
        id: `${run}-new`,
        key: `${run}-new`,
        count: 1,
        lastRequest: now - DAY + 60_000,
      },
    ]);

    const result = await purgeOldRows(t.db, { now });

    expect(result.ok && result.value.rateLimit).toBeGreaterThanOrEqual(1);
    const left = await t.db
      .select({ key: rateLimit.key })
      .from(rateLimit)
      .where(like(rateLimit.key, `${run}%`));
    expect(left).toEqual([{ key: `${run}-new` }]);
    await t.db.delete(rateLimit).where(like(rateLimit.key, `${run}%`));
  });

  it("deletes sessions and verifications more than a day past expiry", async () => {
    const user = await t.fx.newUser();
    const run = `purge-${token()}`;
    const now = Date.now();
    await t.db.insert(session).values([
      {
        id: `${run}-s-old`,
        token: `${run}-t-old`,
        userId: user.id,
        expiresAt: new Date(now - 2 * DAY),
        updatedAt: new Date(),
      },
      {
        id: `${run}-s-recent`,
        token: `${run}-t-recent`,
        userId: user.id,
        expiresAt: new Date(now - DAY / 2),
        updatedAt: new Date(),
      },
      {
        id: `${run}-s-live`,
        token: `${run}-t-live`,
        userId: user.id,
        expiresAt: new Date(now + DAY),
        updatedAt: new Date(),
      },
    ]);
    await t.db.insert(verification).values([
      {
        id: `${run}-v-old`,
        identifier: run,
        value: "x",
        expiresAt: new Date(now - 2 * DAY),
      },
      {
        id: `${run}-v-live`,
        identifier: run,
        value: "x",
        expiresAt: new Date(now + DAY),
      },
    ]);

    const result = await purgeOldRows(t.db, { now });

    expect(result.ok && result.value.session).toBeGreaterThanOrEqual(1);
    expect(result.ok && result.value.verification).toBeGreaterThanOrEqual(1);
    const sessions = await t.db
      .select({ id: session.id })
      .from(session)
      .where(like(session.id, `${run}%`));
    expect(sessions.map((row) => row.id).sort()).toEqual([
      `${run}-s-live`,
      `${run}-s-recent`,
    ]);
    const verifications = await t.db
      .select({ id: verification.id })
      .from(verification)
      .where(like(verification.id, `${run}%`));
    expect(verifications).toEqual([{ id: `${run}-v-live` }]);
    await t.db
      .delete(verification)
      .where(inArray(verification.id, [`${run}-v-live`]));
  });

  it("returns counts only, with no ids or values", async () => {
    const result = await purgeOldRows(t.db, { now: Date.now() });

    expect(result.ok && Object.keys(result.value).sort()).toEqual([
      "rateLimit",
      "searchUsage",
      "session",
      "verification",
    ]);
    if (result.ok) {
      for (const count of Object.values(result.value)) {
        expect(Number.isInteger(count)).toBe(true);
      }
    }
  });
});

describe("purgeOldRows when the database is down", () => {
  it("returns db_unavailable instead of throwing", async () => {
    const down = createDb("postgres://nobody:x@127.0.0.1:1/none");
    try {
      expect(await purgeOldRows(down.db, { now: Date.now() })).toEqual({
        ok: false,
        error: { code: "db_unavailable" },
      });
    } finally {
      await down.pool.end();
    }
  });
});

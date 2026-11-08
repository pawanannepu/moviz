import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  account,
  movies,
  profiles,
  ratings,
  session,
  swipeSkips,
  user,
  verification,
} from "@/db/schema";
import { upsertProfile } from "@/profile/profile";
import { saveRating } from "@/ratings/save-rating";
import { saveSwipe } from "@/ratings/save-swipe";
import {
  TEST_DATABASE_URL,
  token,
  UNKNOWN_USER_ID,
  useTestDb,
} from "@/test-support/test-db";
import { deleteAccount } from "./delete-account";
import { listTablesWithUserId } from "./user-tables";

describe.skipIf(!TEST_DATABASE_URL)("deleteAccount (database)", () => {
  const t = useTestDb();

  async function seedEverything(userId: string, email: string) {
    const [rated, skipped] = await t.fx.newMovies(2);
    await saveRating(t.db, {
      userId,
      movieId: rated.id,
      score: 8,
      source: "manual",
    });
    await saveSwipe(t.db, { userId, movieId: skipped.id, choice: "not_seen" });
    await upsertProfile(t.db, {
      userId,
      country: "GB",
      countrySource: "user",
      termsVersion: "v1",
    });
    await t.db.insert(account).values({
      id: `acct-${token()}`,
      accountId: userId,
      providerId: "credential",
      userId,
      password: "hash",
      updatedAt: new Date(),
    });
    await t.db.insert(session).values({
      id: `sess-${token()}`,
      token: `tok-${token()}`,
      expiresAt: new Date(Date.now() + 3600_000),
      userId,
      updatedAt: new Date(),
    });
    return { rated, skipped, email };
  }

  async function countFor(tableName: string, userId: string) {
    const result = await t.db.execute(
      sql`select count(*)::int as n from ${sql.identifier(tableName)} where user_id = ${userId}`,
    );
    return Number((result.rows[0] as { n: number }).n);
  }

  it("removes the user and every row they own in every user table (AC-13)", async () => {
    const u = await t.fx.newUser();
    await seedEverything(u.id, u.email);
    for (const table of listTablesWithUserId()) {
      expect(
        await countFor(table.name, u.id),
        `${table.name} before`,
      ).toBeGreaterThan(0);
    }

    const result = await deleteAccount(t.db, { userId: u.id });

    expect(result).toEqual({ ok: true, value: undefined });
    for (const table of listTablesWithUserId()) {
      expect(await countFor(table.name, u.id), `${table.name} after`).toBe(0);
    }
    expect(await t.db.select().from(user).where(eq(user.id, u.id))).toEqual([]);
  });

  it("ends the user's sessions (AC-13)", async () => {
    const u = await t.fx.newUser();
    await seedEverything(u.id, u.email);
    await deleteAccount(t.db, { userId: u.id });
    expect(
      await t.db.select().from(session).where(eq(session.userId, u.id)),
    ).toEqual([]);
  });

  it("leaves catalog rows untouched (AC-13)", async () => {
    const u = await t.fx.newUser();
    const { rated, skipped } = await seedEverything(u.id, u.email);
    await deleteAccount(t.db, { userId: u.id });
    const remaining = await t.db.select({ id: movies.id }).from(movies);
    const ids = remaining.map((m) => m.id);
    expect(ids).toContain(rated.id);
    expect(ids).toContain(skipped.id);
  });

  it("leaves another user's data untouched (AC-13, AC-14)", async () => {
    const [gone, kept] = [await t.fx.newUser(), await t.fx.newUser()];
    await seedEverything(gone.id, gone.email);
    await seedEverything(kept.id, kept.email);

    await deleteAccount(t.db, { userId: gone.id });

    for (const table of listTablesWithUserId()) {
      expect(await countFor(table.name, kept.id), table.name).toBeGreaterThan(
        0,
      );
    }
    expect(
      await t.db.select().from(user).where(eq(user.id, kept.id)),
    ).toHaveLength(1);
  });

  describe("verification rows", () => {
    const rowsWithId = (id: string) =>
      t.db.select().from(verification).where(eq(verification.id, id));

    it("removes rows whose value is the user id", async () => {
      const u = await t.fx.newUser();
      const id = await t.fx.newVerification({
        identifier: `reset-password:${token()}`,
        value: u.id,
      });
      await deleteAccount(t.db, { userId: u.id });
      expect(await rowsWithId(id)).toEqual([]);
    });

    it("removes rows keyed by the user's email, in any letter case", async () => {
      const u = await t.fx.newUser();
      const exact = await t.fx.newVerification({
        identifier: u.email,
        value: token(),
      });
      const upper = await t.fx.newVerification({
        identifier: u.email.toUpperCase(),
        value: token(),
      });
      const embedded = await t.fx.newVerification({
        identifier: `sign-in-otp-${u.email}`,
        value: token(),
      });
      await deleteAccount(t.db, { userId: u.id });
      expect(await rowsWithId(exact)).toEqual([]);
      expect(await rowsWithId(upper)).toEqual([]);
      expect(await rowsWithId(embedded)).toEqual([]);
    });

    it("removes rows where the email follows a colon, and keeps a longer address with the same tail behind a colon", async () => {
      const suffix = token();
      const short = await t.fx.newUser({
        id: `colon-short-${suffix}`,
        email: `a@${suffix}.example.test`,
      });
      const long = await t.fx.newUser({
        id: `colon-long-${suffix}`,
        email: `aa@${suffix}.example.test`,
      });
      const shortRow = await t.fx.newVerification({
        identifier: `email-otp:${short.email}`,
        value: token(),
      });
      const longRow = await t.fx.newVerification({
        identifier: `email-otp:${long.email}`,
        value: token(),
      });

      await deleteAccount(t.db, { userId: short.id });

      expect(await rowsWithId(shortRow)).toEqual([]);
      expect(await rowsWithId(longRow)).toHaveLength(1);
    });

    it("keeps another user's verification rows (AC-13, AC-14)", async () => {
      const [gone, kept] = [await t.fx.newUser(), await t.fx.newUser()];
      const byEmail = await t.fx.newVerification({
        identifier: kept.email,
        value: token(),
      });
      const byValue = await t.fx.newVerification({
        identifier: `reset-password:${token()}`,
        value: kept.id,
      });
      await deleteAccount(t.db, { userId: gone.id });
      expect(await rowsWithId(byEmail)).toHaveLength(1);
      expect(await rowsWithId(byValue)).toHaveLength(1);
    });

    it("keeps the verification row of a different address that only contains this address as its tail", async () => {
      const suffix = token();
      const short = await t.fx.newUser({
        id: `short-${suffix}`,
        email: `a@${suffix}.example.test`,
      });
      const long = await t.fx.newUser({
        id: `long-${suffix}`,
        email: `aa@${suffix}.example.test`,
      });
      const longRow = await t.fx.newVerification({
        identifier: long.email,
        value: token(),
      });

      await deleteAccount(t.db, { userId: short.id });

      expect(await rowsWithId(longRow)).toHaveLength(1);
    });

    it("treats % and _ in an address as plain characters", async () => {
      const suffix = token();
      const odd = await t.fx.newUser({
        id: `odd-${suffix}`,
        email: `a%_b@${suffix}.example.test`,
      });
      const other = await t.fx.newUser({
        id: `other-${suffix}`,
        email: `aXXb@${suffix}.example.test`,
      });
      const otherRow = await t.fx.newVerification({
        identifier: other.email,
        value: token(),
      });

      await deleteAccount(t.db, { userId: odd.id });

      expect(await rowsWithId(otherRow)).toHaveLength(1);
    });
  });

  it("returns user_not_found the second time and after the user is gone (AC-13)", async () => {
    const u = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    const first = await deleteAccount(t.db, { userId: u.id });
    const second = await deleteAccount(t.db, { userId: u.id });
    const rateAfter = await saveRating(t.db, {
      userId: u.id,
      movieId: movie.id,
      score: 5,
      source: "manual",
    });

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, error: { code: "user_not_found" } });
    expect(rateAfter).toEqual({ ok: false, error: { code: "user_not_found" } });
  });

  it("returns user_not_found for a user that never existed", async () => {
    expect(await deleteAccount(t.db, { userId: UNKNOWN_USER_ID })).toEqual({
      ok: false,
      error: { code: "user_not_found" },
    });
  });

  it("leaves no rating rows when it races 12 parallel saveRating calls (AC-13)", async () => {
    const u = await t.fx.newUser();
    const movieList = await t.fx.newMovies(12);

    const outcomes = await Promise.allSettled([
      deleteAccount(t.db, { userId: u.id }),
      ...movieList.map((movie) =>
        saveRating(t.db, {
          userId: u.id,
          movieId: movie.id,
          score: 5,
          source: "manual",
        }),
      ),
    ]);

    for (const outcome of outcomes) {
      expect(outcome.status).toBe("fulfilled");
      if (outcome.status !== "fulfilled") continue;
      const value = outcome.value;
      expect(value.ok || value.error.code === "user_not_found").toBe(true);
    }
    expect(
      await t.db.select().from(ratings).where(eq(ratings.userId, u.id)),
    ).toEqual([]);
    expect(
      await t.db.select().from(swipeSkips).where(eq(swipeSkips.userId, u.id)),
    ).toEqual([]);
    expect(
      await t.db.select().from(profiles).where(eq(profiles.userId, u.id)),
    ).toEqual([]);
  });
});

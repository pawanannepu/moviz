import { and, asc, desc, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  imports,
  importUnmatchedRows,
  profiles,
  ratings,
  swipeSkips,
} from "@/db/schema";
import {
  TEST_DATABASE_URL,
  UNKNOWN_USER_ID,
  useTestDb,
} from "@/test-support/test-db";
import type { ImportPlan, PlannedRating, UnmatchedRow } from "./plan-import";
import type { UnmatchedReason } from "./row-rules";
import { countImportsToday, saveImportResult } from "./save-import-result";

// Spec 0009: the one transaction (AC-1 to AC-10, AC-16). Runs on the Neon test
// branch. Every test makes its own users and movies.
const planned = (
  movieId: number,
  rowNumber = 1,
  over: Partial<PlannedRating> = {},
): PlannedRating => ({
  rowNumber,
  title: "A film",
  year: 2001,
  movieId,
  score: 8,
  ratedAt: null,
  ...over,
});
const unmatched = (
  rowNumber: number,
  reason: UnmatchedReason = "no_match",
): UnmatchedRow => ({
  rowNumber,
  title: `Row ${rowNumber}`,
  year: 1999,
  score: 6,
  reason,
});
const plan = (
  ratingList: PlannedRating[],
  unmatchedList: UnmatchedRow[] = [],
): ImportPlan => ({
  rowsTotal: ratingList.length + unmatchedList.length,
  ratings: ratingList,
  unmatched: unmatchedList,
});

describe.skipIf(!TEST_DATABASE_URL)("saveImportResult (database)", () => {
  const t = useTestDb();

  const ratingOf = async (userId: string, movieId: number) =>
    (
      await t.db
        .select()
        .from(ratings)
        .where(and(eq(ratings.userId, userId), eq(ratings.movieId, movieId)))
    )[0];
  const importsOf = (userId: string) =>
    t.db
      .select()
      .from(imports)
      .where(eq(imports.userId, userId))
      .orderBy(desc(imports.createdAt), desc(imports.id));
  const save = (userId: string, p: ImportPlan, options = {}) =>
    saveImportResult(t.db, { userId, plan: p }, options);
  const okValue = async (promise: ReturnType<typeof save>) => {
    const result = await promise;
    if (!result.ok) throw new Error(`save failed: ${result.error.code}`);
    return result.value;
  };

  describe("a good import (AC-1, AC-2, AC-5, AC-6)", () => {
    it("saves each planned movie as a rating with source import and the planned score (AC-1)", async () => {
      const user = await t.fx.newUser();
      const [a, b] = await t.fx.newMovies(2);

      await okValue(
        save(
          user.id,
          plan([
            planned(a.id, 1, { score: 7 }),
            planned(b.id, 2, { score: 10 }),
          ]),
        ),
      );

      expect(await ratingOf(user.id, a.id)).toMatchObject({
        score: 7,
        source: "import",
      });
      expect(await ratingOf(user.id, b.id)).toMatchObject({
        score: 10,
        source: "import",
      });
    });

    it("uses the date from the file as rated_at, and the database now() when there is none (AC-5)", async () => {
      const user = await t.fx.newUser();
      const [dated, undated] = await t.fx.newMovies(2);

      await okValue(
        save(
          user.id,
          plan([
            planned(dated.id, 1, { ratedAt: new Date("2024-03-02T00:00:00Z") }),
            planned(undated.id, 2, { ratedAt: null }),
          ]),
        ),
      );

      expect((await ratingOf(user.id, dated.id)).ratedAt.toISOString()).toBe(
        "2024-03-02T00:00:00.000Z",
      );
      const age =
        Date.now() - (await ratingOf(user.id, undated.id)).ratedAt.getTime();
      expect(Math.abs(age)).toBeLessThan(120_000);
    });

    it("returns the import id and counts that match the stored import row (AC-2)", async () => {
      const user = await t.fx.newUser();
      const [a, b] = await t.fx.newMovies(2);

      const saved = await okValue(
        save(
          user.id,
          plan(
            [planned(a.id, 1), planned(b.id, 2)],
            [unmatched(3), unmatched(4, "duplicate")],
          ),
        ),
      );

      expect(saved).toMatchObject({
        rowsTotal: 4,
        rowsMatched: 2,
        rowsUnmatched: 2,
      });
      const [row] = await importsOf(user.id);
      expect(row).toMatchObject({
        id: saved.importId,
        status: "completed",
        rowsTotal: 4,
        rowsMatched: 2,
        rowsUnmatched: 2,
      });
      expect(row.completedAt).not.toBeNull();
      expect(row.rowsMatched + row.rowsUnmatched).toBe(row.rowsTotal);
    });

    it("stores the unmatched rows with their reason, title, year and score, in file order (AC-2)", async () => {
      const user = await t.fx.newUser();
      const saved = await okValue(
        save(
          user.id,
          plan(
            [],
            [
              unmatched(2, "ambiguous"),
              unmatched(5, "invalid_row"),
              unmatched(9, "duplicate"),
            ],
          ),
        ),
      );

      const rows = await t.db
        .select()
        .from(importUnmatchedRows)
        .where(eq(importUnmatchedRows.importId, saved.importId))
        .orderBy(asc(importUnmatchedRows.rowNumber));
      expect(rows.map((r) => [r.rowNumber, r.reason])).toEqual([
        [2, "ambiguous"],
        [5, "invalid_row"],
        [9, "duplicate"],
      ]);
      expect(rows[0]).toMatchObject({ title: "Row 2", year: 1999, score: 6 });
    });

    it("replaces a swipe rating, keeps its first rated_at and moves updated_at forward (AC-5)", async () => {
      const user = await t.fx.newUser();
      const movie = await t.fx.newMovie();
      const first = new Date("2020-01-01T00:00:00Z");
      await t.db.insert(ratings).values({
        userId: user.id,
        movieId: movie.id,
        score: 2,
        source: "swipe",
        ratedAt: first,
        updatedAt: first,
      });

      await okValue(
        save(
          user.id,
          plan([
            planned(movie.id, 1, {
              score: 9,
              ratedAt: new Date("2024-03-02T00:00:00Z"),
            }),
          ]),
        ),
      );

      const after = await ratingOf(user.id, movie.id);
      expect(after).toMatchObject({ score: 9, source: "import" });
      expect(after.ratedAt.toISOString()).toBe(first.toISOString());
      expect(after.updatedAt.getTime()).toBeGreaterThan(first.getTime());
    });

    it("replaces an earlier import's rating too (AC-5)", async () => {
      const user = await t.fx.newUser();
      const movie = await t.fx.newMovie();
      await okValue(save(user.id, plan([planned(movie.id, 1, { score: 4 })])));
      await okValue(save(user.id, plan([planned(movie.id, 1, { score: 9 })])));

      expect(await ratingOf(user.id, movie.id)).toMatchObject({
        score: 9,
        source: "import",
      });
      expect(await t.db.$count(ratings, eq(ratings.userId, user.id))).toBe(1);
    });

    it("never changes a manual rating, and reports that row as kept_manual in the counts (AC-5)", async () => {
      const user = await t.fx.newUser();
      const [manual, other] = await t.fx.newMovies(2);
      await t.db.insert(ratings).values({
        userId: user.id,
        movieId: manual.id,
        score: 3,
        source: "manual",
      });

      const saved = await okValue(
        save(
          user.id,
          plan([planned(manual.id, 1, { score: 10 }), planned(other.id, 2)]),
        ),
      );

      expect(await ratingOf(user.id, manual.id)).toMatchObject({
        score: 3,
        source: "manual",
      });
      expect(saved).toMatchObject({
        rowsTotal: 2,
        rowsMatched: 1,
        rowsUnmatched: 1,
      });
      const rows = await t.db
        .select()
        .from(importUnmatchedRows)
        .where(eq(importUnmatchedRows.importId, saved.importId));
      expect(rows).toMatchObject([{ rowNumber: 1, reason: "kept_manual" }]);
    });

    it("merges kept_manual rows into the unmatched rows in file order (AC-5)", async () => {
      const user = await t.fx.newUser();
      const [manual] = await t.fx.newMovies(1);
      await t.db.insert(ratings).values({
        userId: user.id,
        movieId: manual.id,
        score: 3,
        source: "manual",
      });

      const saved = await okValue(
        save(
          user.id,
          plan([planned(manual.id, 2)], [unmatched(1), unmatched(3)]),
        ),
      );

      const rows = await t.db
        .select()
        .from(importUnmatchedRows)
        .where(eq(importUnmatchedRows.importId, saved.importId))
        .orderBy(asc(importUnmatchedRows.rowNumber));
      expect(rows.map((r) => [r.rowNumber, r.reason])).toEqual([
        [1, "no_match"],
        [2, "kept_manual"],
        [3, "no_match"],
      ]);
    });

    it("removes a saved movie from the user's skips and leaves other skips alone (AC-6)", async () => {
      const user = await t.fx.newUser();
      const [rated, stillSkipped] = await t.fx.newMovies(2);
      await t.db.insert(swipeSkips).values([
        { userId: user.id, movieId: rated.id },
        { userId: user.id, movieId: stillSkipped.id },
      ]);

      await okValue(save(user.id, plan([planned(rated.id)])));

      const skips = await t.db
        .select()
        .from(swipeSkips)
        .where(eq(swipeSkips.userId, user.id));
      expect(skips.map((s) => s.movieId)).toEqual([stillSkipped.id]);
    });

    it("does not touch another user's ratings or skips (AC-12)", async () => {
      const [mine, theirs] = [await t.fx.newUser(), await t.fx.newUser()];
      const movie = await t.fx.newMovie();
      await t.db.insert(ratings).values({
        userId: theirs.id,
        movieId: movie.id,
        score: 4,
        source: "manual",
      });
      await t.db
        .insert(swipeSkips)
        .values({ userId: theirs.id, movieId: movie.id });

      await okValue(save(mine.id, plan([planned(movie.id)])));

      expect(await ratingOf(theirs.id, movie.id)).toMatchObject({
        score: 4,
        source: "manual",
      });
      expect(
        await t.db.$count(swipeSkips, eq(swipeSkips.userId, theirs.id)),
      ).toBe(1);
      expect(await importsOf(theirs.id)).toHaveLength(0);
    });

    it("saves an import with no matches and still stores its unmatched rows (AC-2)", async () => {
      const user = await t.fx.newUser();
      const saved = await okValue(
        save(user.id, plan([], [unmatched(1), unmatched(2)])),
      );
      expect(saved).toMatchObject({ rowsMatched: 0, rowsUnmatched: 2 });
      expect(await t.db.$count(ratings, eq(ratings.userId, user.id))).toBe(0);
    });
  });

  describe("chunks (AC-16)", () => {
    it("saves more ratings and more unmatched rows than one chunk of 1000 holds", async () => {
      const user = await t.fx.newUser();
      const movies = await t.fx.newMovies(1_250);
      const unmatchedRows = Array.from({ length: 2_300 }, (_, i) =>
        unmatched(i + 1_251),
      );

      const saved = await okValue(
        save(
          user.id,
          plan(
            movies.map((m, i) => planned(m.id, i + 1)),
            unmatchedRows,
          ),
        ),
      );

      expect(saved).toMatchObject({
        rowsTotal: 3_550,
        rowsMatched: 1_250,
        rowsUnmatched: 2_300,
      });
      expect(await t.db.$count(ratings, eq(ratings.userId, user.id))).toBe(
        1_250,
      );
      expect(
        await t.db.$count(
          importUnmatchedRows,
          eq(importUnmatchedRows.importId, saved.importId),
        ),
      ).toBe(2_300);
    });
  });

  describe("onboarding (AC-8)", () => {
    const withProfile = async (existing: number) => {
      const user = await t.fx.newUser();
      await t.db.insert(profiles).values({ userId: user.id });
      if (existing > 0) {
        const movies = await t.fx.newMovies(existing);
        await t.db.insert(ratings).values(
          movies.map((m) => ({
            userId: user.id,
            movieId: m.id,
            score: 7,
            source: "manual" as const,
          })),
        );
      }
      return user;
    };
    const profileOf = async (userId: string) =>
      (
        await t.db.select().from(profiles).where(eq(profiles.userId, userId))
      )[0];

    it("marks the user onboarded when they reach 10 ratings, counting ratings they already had", async () => {
      const user = await withProfile(9);
      const [movie] = await t.fx.newMovies(1);

      const saved = await okValue(save(user.id, plan([planned(movie.id)])));

      expect(saved.onboarded).toBe(true);
      expect((await profileOf(user.id)).onboardedAt).not.toBeNull();
    });

    it("leaves the user not onboarded below 10 ratings", async () => {
      const user = await withProfile(3);
      const [movie] = await t.fx.newMovies(1);

      const saved = await okValue(save(user.id, plan([planned(movie.id)])));

      expect(saved.onboarded).toBe(false);
      expect((await profileOf(user.id)).onboardedAt).toBeNull();
    });

    it("keeps the first onboarded time when the user imports again", async () => {
      const user = await withProfile(10);
      const first = new Date("2025-05-05T00:00:00Z");
      await t.db
        .update(profiles)
        .set({ onboardedAt: first })
        .where(eq(profiles.userId, user.id));
      const [movie] = await t.fx.newMovies(1);

      const saved = await okValue(save(user.id, plan([planned(movie.id)])));

      expect(saved.onboarded).toBe(true);
      expect((await profileOf(user.id)).onboardedAt?.toISOString()).toBe(
        first.toISOString(),
      );
    });

    it("reports onboarded for a user who finished before, even with a small import", async () => {
      const user = await withProfile(0);
      await t.db
        .update(profiles)
        .set({ onboardedAt: new Date() })
        .where(eq(profiles.userId, user.id));
      const [movie] = await t.fx.newMovies(1);

      expect(
        (await okValue(save(user.id, plan([planned(movie.id)])))).onboarded,
      ).toBe(true);
    });

    it("does not fail the import for a user with no profile row", async () => {
      const user = await t.fx.newUser();
      const movies = await t.fx.newMovies(10);

      const saved = await okValue(
        save(user.id, plan(movies.map((m, i) => planned(m.id, i + 1)))),
      );

      expect(saved.onboarded).toBe(false);
      expect(await t.db.$count(ratings, eq(ratings.userId, user.id))).toBe(10);
    });
  });

  describe("the daily limit (AC-9)", () => {
    const old = (userId: string, secondsBefore: number) =>
      t.db.insert(imports).values({
        userId,
        status: "completed",
        rowsTotal: 0,
        rowsMatched: 0,
        rowsUnmatched: 0,
        createdAt: sql`(date_trunc('day', now() at time zone 'utc') at time zone 'utc') - ${secondsBefore} * interval '1 second'`,
      });

    it("allows 5 imports in a day and refuses the sixth with the reset time, writing nothing", async () => {
      const user = await t.fx.newUser();
      const movie = await t.fx.newMovie();
      for (let i = 0; i < 5; i++)
        await okValue(save(user.id, plan([planned(movie.id)])));

      const sixth = await save(
        user.id,
        plan([planned(movie.id)], [unmatched(2)]),
      );

      expect(sixth.ok).toBe(false);
      if (sixth.ok || sixth.error.code !== "daily_limit")
        throw new Error("expected daily_limit");
      expect(sixth.error.resetAt.toISOString()).toMatch(/T00:00:00\.000Z$/);
      expect(sixth.error.resetAt.getTime()).toBeGreaterThan(Date.now());
      expect(sixth.error.resetAt.getTime() - Date.now()).toBeLessThanOrEqual(
        24 * 3_600_000,
      );
      const rows = await importsOf(user.id);
      expect(rows).toHaveLength(5);
      expect(rows.every((r) => r.status === "completed")).toBe(true);
    });

    it("does not count imports from before today's UTC midnight", async () => {
      const user = await t.fx.newUser();
      for (let i = 1; i <= 5; i++) await old(user.id, i);
      const movie = await t.fx.newMovie();

      expect((await save(user.id, plan([planned(movie.id)]))).ok).toBe(true);
    });

    it("counts a failed import against the day's limit", async () => {
      const user = await t.fx.newUser();
      const movie = await t.fx.newMovie();
      for (let i = 0; i < 4; i++)
        await okValue(save(user.id, plan([planned(movie.id)])));
      let clock = 0;
      const failed = await save(user.id, plan([planned(movie.id)]), {
        budgetMs: 5,
        nowMs: () => (clock += 10),
      });
      expect(failed.ok).toBe(false);

      const next = await save(user.id, plan([planned(movie.id)]));

      expect(next.ok).toBe(false);
      if (next.ok) throw new Error("expected a refusal");
      expect(next.error.code).toBe("daily_limit");
    });

    it("lets exactly 5 of 7 parallel imports through and writes no extra row", async () => {
      const user = await t.fx.newUser();
      const movie = await t.fx.newMovie();

      const results = await Promise.all(
        Array.from({ length: 7 }, () =>
          save(user.id, plan([planned(movie.id)])),
        ),
      );

      expect(results.filter((r) => r.ok)).toHaveLength(5);
      expect(
        results.filter((r) => !r.ok && r.error.code === "daily_limit"),
      ).toHaveLength(2);
      expect(await importsOf(user.id)).toHaveLength(5);
    });

    it("counts each user's imports separately (AC-12)", async () => {
      const [busy, quiet] = [await t.fx.newUser(), await t.fx.newUser()];
      const movie = await t.fx.newMovie();
      for (let i = 0; i < 5; i++)
        await okValue(save(busy.id, plan([planned(movie.id)])));

      expect((await save(quiet.id, plan([planned(movie.id)]))).ok).toBe(true);
    });

    it("countImportsToday follows the database UTC day and names the next midnight", async () => {
      const user = await t.fx.newUser();
      await old(user.id, 60);
      await t.db.insert(imports).values({
        userId: user.id,
        status: "failed",
        rowsTotal: 0,
        rowsMatched: 0,
        rowsUnmatched: 0,
      });

      const today = await countImportsToday(t.db, user.id);

      expect(today.count).toBe(1);
      expect(today.resetAt.toISOString()).toMatch(/T00:00:00\.000Z$/);
    });
  });

  describe("keeping the latest 5 (AC-10)", () => {
    it("deletes older imports and their unmatched rows when a new one is saved", async () => {
      const user = await t.fx.newUser();
      const inserted: number[] = [];
      for (let i = 0; i < 5; i++) {
        const [row] = await t.db
          .insert(imports)
          .values({
            userId: user.id,
            status: "completed",
            rowsTotal: 1,
            rowsMatched: 0,
            rowsUnmatched: 1,
            createdAt: sql`(date_trunc('day', now() at time zone 'utc') at time zone 'utc') - ${i + 1} * interval '1 hour'`,
          })
          .returning({ id: imports.id });
        await t.db.insert(importUnmatchedRows).values({
          importId: row.id,
          rowNumber: 1,
          title: "old",
          year: null,
          score: null,
          reason: "no_match",
        });
        inserted.push(row.id);
      }

      const saved = await okValue(save(user.id, plan([], [unmatched(1)])));

      const kept = await importsOf(user.id);
      expect(kept).toHaveLength(5);
      expect(kept[0].id).toBe(saved.importId);
      // The oldest one went, with its unmatched row.
      const oldest = inserted[inserted.length - 1];
      expect(kept.map((k) => k.id)).not.toContain(oldest);
      expect(
        await t.db.$count(
          importUnmatchedRows,
          eq(importUnmatchedRows.importId, oldest),
        ),
      ).toBe(0);
      expect(
        await t.db.$count(
          importUnmatchedRows,
          eq(importUnmatchedRows.importId, inserted[0]),
        ),
      ).toBe(1);
    });

    it("does not prune another user's imports", async () => {
      const [mine, theirs] = [await t.fx.newUser(), await t.fx.newUser()];
      for (let i = 0; i < 5; i++) {
        await t.db.insert(imports).values({
          userId: theirs.id,
          status: "completed",
          rowsTotal: 0,
          rowsMatched: 0,
          rowsUnmatched: 0,
        });
      }
      await okValue(save(mine.id, plan([], [unmatched(1)])));
      expect(await importsOf(theirs.id)).toHaveLength(5);
    });
  });

  describe("a failed save (AC-7)", () => {
    const manyRatings = async (userId: string, count: number) => {
      const movies = await t.fx.newMovies(count);
      return {
        user: userId,
        p: plan(movies.map((m, i) => planned(m.id, i + 1))),
      };
    };

    it("rolls everything back, stores one failed import and returns db_unavailable when the time budget runs out", async () => {
      const user = await t.fx.newUser();
      const { p } = await manyRatings(user.id, 3);
      let clock = 0;

      const result = await save(user.id, p, {
        budgetMs: 5,
        nowMs: () => (clock += 10),
      });

      expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
      expect(await t.db.$count(ratings, eq(ratings.userId, user.id))).toBe(0);
      const rows = await importsOf(user.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: "failed",
        rowsTotal: 3,
        rowsMatched: 0,
        rowsUnmatched: 0,
        completedAt: null,
      });
    });

    it("rolls back ratings already written when the budget runs out between chunks", async () => {
      const user = await t.fx.newUser();
      const { p } = await manyRatings(user.id, 1_200);
      let calls = 0;
      // The clock stays at 0 for the start, both manual lookups and the first rating chunk, then jumps.
      const nowMs = () => (calls++ < 4 ? 0 : 10_000_000);

      const result = await save(user.id, p, { budgetMs: 1_000, nowMs });

      expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
      expect(await t.db.$count(ratings, eq(ratings.userId, user.id))).toBe(0);
      expect((await importsOf(user.id)).map((r) => r.status)).toEqual([
        "failed",
      ]);
    });

    it("leaves the user's earlier ratings and skips as they were", async () => {
      const user = await t.fx.newUser();
      const [kept, skipped] = await t.fx.newMovies(2);
      await t.db.insert(ratings).values({
        userId: user.id,
        movieId: kept.id,
        score: 5,
        source: "swipe",
      });
      await t.db
        .insert(swipeSkips)
        .values({ userId: user.id, movieId: skipped.id });
      const { p } = await manyRatings(user.id, 2);
      p.ratings.push(planned(skipped.id, 3));
      p.rowsTotal += 1;
      let clock = 0;

      await save(user.id, p, { budgetMs: 5, nowMs: () => (clock += 10) });

      expect(await ratingOf(user.id, kept.id)).toMatchObject({
        score: 5,
        source: "swipe",
      });
      expect(
        await t.db.$count(swipeSkips, eq(swipeSkips.userId, user.id)),
      ).toBe(1);
    });

    it("keeps only the latest 5 imports when it stores a failed one", async () => {
      const user = await t.fx.newUser();
      for (let i = 0; i < 5; i++) {
        await t.db.insert(imports).values({
          userId: user.id,
          status: "completed",
          rowsTotal: 0,
          rowsMatched: 0,
          rowsUnmatched: 0,
          createdAt: sql`(date_trunc('day', now() at time zone 'utc') at time zone 'utc') - ${i + 1} * interval '1 hour'`,
        });
      }
      const { p } = await manyRatings(user.id, 1);
      let clock = 0;

      await save(user.id, p, { budgetMs: 5, nowMs: () => (clock += 10) });

      const rows = await importsOf(user.id);
      expect(rows).toHaveLength(5);
      expect(rows[0].status).toBe("failed");
    });

    it("rolls back and stores a failed import when a planned movie no longer exists", async () => {
      const user = await t.fx.newUser();
      const [real] = await t.fx.newMovies(1);
      const p = plan([planned(real.id, 1), planned(4_503_599_627_370_000, 2)]);

      const result = await save(user.id, p);

      expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
      expect(await t.db.$count(ratings, eq(ratings.userId, user.id))).toBe(0);
      expect((await importsOf(user.id)).map((r) => r.status)).toEqual([
        "failed",
      ]);
    });

    it("rolls back when the plan's counts do not add up", async () => {
      const user = await t.fx.newUser();
      const [movie] = await t.fx.newMovies(1);
      const p = plan([planned(movie.id)]);
      p.rowsTotal = 5;

      const result = await save(user.id, p);

      expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
      expect(await t.db.$count(ratings, eq(ratings.userId, user.id))).toBe(0);
    });

    it("returns user_not_found and stores nothing, not even a failed import, when the user is gone", async () => {
      const [movie] = await t.fx.newMovies(1);

      const result = await save(UNKNOWN_USER_ID, plan([planned(movie.id)]));

      expect(result).toEqual({ ok: false, error: { code: "user_not_found" } });
      expect(await importsOf(UNKNOWN_USER_ID)).toHaveLength(0);
    });
  });
});

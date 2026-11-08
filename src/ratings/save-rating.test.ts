import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ratings, swipeSkips } from "@/db/schema";
import {
  forbiddenDb,
  TEST_DATABASE_URL,
  UNKNOWN_MOVIE_ID,
  UNKNOWN_USER_ID,
  useTestDb,
} from "@/test-support/test-db";
import { saveRating } from "./save-rating";

describe("saveRating input checks", () => {
  it.each([0, 11, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "returns invalid_score for %s without touching the database (AC-2)",
    async (score) => {
      const result = await saveRating(forbiddenDb, {
        userId: "u",
        movieId: 1,
        score,
        source: "manual",
      });
      expect(result).toEqual({ ok: false, error: { code: "invalid_score" } });
    },
  );
});

describe.skipIf(!TEST_DATABASE_URL)("saveRating (database)", () => {
  const t = useTestDb();

  const rowsFor = (userId: string, movieId: number) =>
    t.db
      .select()
      .from(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.movieId, movieId)));

  it("saves a new rating and returns the row", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();

    const result = await saveRating(t.db, {
      userId: user.id,
      movieId: movie.id,
      score: 7,
      source: "manual",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        userId: user.id,
        movieId: movie.id,
        score: 7,
        source: "manual",
      });
    }
    expect(await rowsFor(user.id, movie.id)).toHaveLength(1);
  });

  it.each([1, 10])("accepts the boundary score %s", async (score) => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    const result = await saveRating(t.db, {
      userId: user.id,
      movieId: movie.id,
      score,
      source: "manual",
    });
    expect(result.ok).toBe(true);
  });

  it("overwrites score and source on a second save, keeps rated_at, moves updated_at forward (AC-2)", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    const first = await saveRating(t.db, {
      userId: user.id,
      movieId: movie.id,
      score: 4,
      source: "swipe",
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const second = await saveRating(t.db, {
      userId: user.id,
      movieId: movie.id,
      score: 9,
      source: "manual",
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const rows = await rowsFor(user.id, movie.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ score: 9, source: "manual" });
    expect(second.value.ratedAt.getTime()).toBe(first.value.ratedAt.getTime());
    expect(second.value.updatedAt.getTime()).toBeGreaterThan(
      first.value.updatedAt.getTime(),
    );
  });

  it("keeps ratings of different users for the same movie apart (AC-14)", async () => {
    const [a, b] = [await t.fx.newUser(), await t.fx.newUser()];
    const movie = await t.fx.newMovie();
    await saveRating(t.db, {
      userId: a.id,
      movieId: movie.id,
      score: 2,
      source: "manual",
    });
    await saveRating(t.db, {
      userId: b.id,
      movieId: movie.id,
      score: 9,
      source: "manual",
    });

    expect((await rowsFor(a.id, movie.id))[0].score).toBe(2);
    expect((await rowsFor(b.id, movie.id))[0].score).toBe(9);
  });

  it("removes the movie from the user's skips, and only that movie's skip (AC-3)", async () => {
    const user = await t.fx.newUser();
    const [rated, other] = [await t.fx.newMovie(), await t.fx.newMovie()];
    await t.db.insert(swipeSkips).values([
      { userId: user.id, movieId: rated.id },
      { userId: user.id, movieId: other.id },
    ]);

    await saveRating(t.db, {
      userId: user.id,
      movieId: rated.id,
      score: 6,
      source: "manual",
    });

    const skips = await t.db
      .select()
      .from(swipeSkips)
      .where(eq(swipeSkips.userId, user.id));
    expect(skips.map((s) => s.movieId)).toEqual([other.id]);
  });

  it("does not remove another user's skip for the same movie (AC-14)", async () => {
    const [a, b] = [await t.fx.newUser(), await t.fx.newUser()];
    const movie = await t.fx.newMovie();
    await t.db.insert(swipeSkips).values({ userId: b.id, movieId: movie.id });

    await saveRating(t.db, {
      userId: a.id,
      movieId: movie.id,
      score: 6,
      source: "manual",
    });

    const skips = await t.db
      .select()
      .from(swipeSkips)
      .where(eq(swipeSkips.userId, b.id));
    expect(skips).toHaveLength(1);
  });

  it("returns movie_not_found for a movie that does not exist (AC-13)", async () => {
    const user = await t.fx.newUser();
    const result = await saveRating(t.db, {
      userId: user.id,
      movieId: UNKNOWN_MOVIE_ID,
      score: 5,
      source: "manual",
    });
    expect(result).toEqual({ ok: false, error: { code: "movie_not_found" } });
  });

  it("returns user_not_found for a user that does not exist (AC-13)", async () => {
    const movie = await t.fx.newMovie();
    const result = await saveRating(t.db, {
      userId: UNKNOWN_USER_ID,
      movieId: movie.id,
      score: 5,
      source: "manual",
    });
    expect(result).toEqual({ ok: false, error: { code: "user_not_found" } });
  });

  it("leaves no rating behind after a failed save", async () => {
    const user = await t.fx.newUser();
    await saveRating(t.db, {
      userId: user.id,
      movieId: UNKNOWN_MOVIE_ID,
      score: 5,
      source: "manual",
    });
    const rows = await t.db
      .select()
      .from(ratings)
      .where(eq(ratings.userId, user.id));
    expect(rows).toEqual([]);
  });
});

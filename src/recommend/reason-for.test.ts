import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/create-db";
import {
  capturingDb,
  useRecommendFixtures,
  vec,
} from "@/test-support/recommend-fixtures";
import {
  forbiddenDb,
  TEST_DATABASE_URL,
  UNKNOWN_MOVIE_ID,
  useTestDb,
} from "@/test-support/test-db";
import { reasonFor } from "./reason-for";
import { recommendMovies } from "./recommend-movies";
import type { Reason } from "./types";

// Spec 0010: the reason on the movie detail page. The database tests share the
// test branch with every other file, so they use their own band of vector
// dimensions (band 3, from 320) and only look at movies they made.

const USER_ID = "user-secret-7f3a";
const MOVIE_ID = 424242;

describe("reasonFor input (AC-7)", () => {
  it.each([
    ["an empty user id", { userId: "", movieId: 1 }],
    ["a movie id of 0", { userId: "u", movieId: 0 }],
    ["a negative movie id", { userId: "u", movieId: -3 }],
    ["a movie id that is not whole", { userId: "u", movieId: 1.5 }],
    ["a movie id that is not a number", { userId: "u", movieId: Number.NaN }],
  ])("returns invalid_input for %s, before any read", async (_name, input) => {
    expect(await reasonFor(forbiddenDb, input)).toEqual({
      ok: false,
      error: { code: "invalid_input" },
    });
  });
});

describe("reasonFor failures (AC-9, AC-16)", () => {
  const failing = (error: unknown) =>
    ({ transaction: () => Promise.reject(error) }) as unknown as Db;

  it("returns db_unavailable when the database cannot be reached", async () => {
    const outage = Object.assign(new Error("terminating connection"), {
      code: "57P01",
    });

    expect(
      await reasonFor(failing(outage), { userId: USER_ID, movieId: MOVIE_ID }),
    ).toEqual({ ok: false, error: { code: "db_unavailable" } });
  });

  it("throws a clean error for a bug, with no user id, movie id or query values", async () => {
    const bug = new DrizzleQueryError(
      "select ... where user_id = $1 and movie_id = $2",
      [USER_ID, MOVIE_ID],
      Object.assign(new Error("operator does not exist"), { code: "42883" }),
    );

    const thrown = await reasonFor(failing(bug), {
      userId: USER_ID,
      movieId: MOVIE_ID,
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(Error);
    const error = thrown as Error & { cause?: unknown };
    const loggable = [
      error.message,
      error.stack,
      JSON.stringify(error),
      String(error.cause),
    ].join("\n");
    expect(error.message).toContain("reasonFor");
    expect(error.message).toContain("42883");
    expect(error.cause).toBeUndefined();
    expect(loggable).not.toContain(USER_ID);
    expect(loggable).not.toContain(String(MOVIE_ID));
  });
});

/** Anchors sit on their own dimensions, so a test controls every similarity. */
const A = 320;
const B = 321;

/** A unit vector with the given similarity to the anchors at `A` and `B`. */
function between(simA: number, simB: number, privateDim: number): number[] {
  return vec([
    [A, simA],
    [B, simB],
    [privateDim, Math.sqrt(1 - simA * simA - simB * simB)],
  ]);
}

describe.skipIf(!TEST_DATABASE_URL)("reasonFor", () => {
  const ctx = useTestDb();
  const fx = useRecommendFixtures(() => ctx.db, { band: 3, privateFrom: 330 });

  async function reason(
    userId: string,
    movieId: number,
    db = ctx.db,
  ): Promise<Reason | null> {
    const result = await reasonFor(db, { userId, movieId });
    if (!result.ok) throw new Error(`reasonFor failed: ${result.error.code}`);
    return result.value;
  }

  const newUserId = async () => (await ctx.fx.newUser()).id;

  describe("the anchor (AC-7)", () => {
    it("names the liked movie with the largest weight times similarity, not the closest one", async () => {
      const [loved, liked, nearLoved, nearLiked] = await fx.addMovies([
        { vector: vec([[A, 1]]), releaseDate: "1995-12-15" },
        { vector: vec([[B, 1]]) },
        // 1.0 * 0.5 beats 0.556 * 0.8, though the second movie is closer.
        { vector: between(0.5, 0.8, fx.privateDim()) },
        // 1.0 * 0.3 loses to 0.556 * 0.8.
        { vector: between(0.3, 0.8, fx.privateDim()) },
      ]);
      const userId = await newUserId();
      await fx.rate(userId, [
        { movieId: loved, score: 10 },
        { movieId: liked, score: 8 },
      ]);

      expect(await reason(userId, nearLoved)).toEqual({
        kind: "similar_to_liked",
        anchor: {
          movieId: loved,
          title: expect.stringMatching(/^Rec Test /),
          releaseYear: 1995,
          score: 10,
        },
      });
      expect(await reason(userId, nearLiked)).toMatchObject({
        kind: "similar_to_liked",
        anchor: { movieId: liked, releaseYear: null, score: 8 },
      });
    });

    it("breaks a tie toward the lower movie id", async () => {
      const [first, second, target] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: vec([[A, 1]]) },
        { vector: between(0.7, 0, fx.privateDim()) },
      ]);
      const userId = await newUserId();
      await fx.rate(userId, [
        { movieId: second, score: 9 },
        { movieId: first, score: 9 },
      ]);

      expect(await reason(userId, target)).toMatchObject({
        kind: "similar_to_liked",
        anchor: { movieId: Math.min(first, second) },
      });
    });

    it("never names a disliked movie, however close it is", async () => {
      const [liked, disliked, target] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: vec([[B, 1]]) },
        { vector: between(0.1, 0.95, fx.privateDim()) },
      ]);
      const userId = await newUserId();
      await fx.rate(userId, [
        { movieId: liked, score: 6 },
        { movieId: disliked, score: 1 },
      ]);

      expect(await reason(userId, target)).toMatchObject({
        kind: "similar_to_liked",
        anchor: { movieId: liked, score: 6 },
      });
    });

    it("gives the same reason the feed's recommender gives for that movie", async () => {
      const [loved, liked, target] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: vec([[B, 1]]) },
        { vector: between(0.6, 0.7, fx.privateDim()) },
      ]);
      const userId = await newUserId();
      await fx.rate(userId, [
        { movieId: loved, score: 10 },
        { movieId: liked, score: 7 },
      ]);

      const feed = await recommendMovies(ctx.db, { userId, limit: 50 });
      if (!feed.ok)
        throw new Error(`recommendMovies failed: ${feed.error.code}`);
      const pick = feed.value.picks.find((p) => p.movie.id === target);

      expect(pick).toBeDefined();
      expect(await reason(userId, target)).toEqual(pick?.reason);
    });
  });

  describe("popular (AC-7)", () => {
    it("says popular when the user has no liked movie", async () => {
      const [disliked, target] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: between(0.9, 0, fx.privateDim()) },
      ]);
      const unrated = await newUserId();
      const onlyDislikes = await newUserId();
      await fx.rate(onlyDislikes, [{ movieId: disliked, score: 3 }]);

      expect(await reason(unrated, target)).toEqual({ kind: "popular" });
      expect(await reason(onlyDislikes, target)).toEqual({ kind: "popular" });
    });

    it("says popular for a listable movie that has no embedding", async () => {
      const [liked, bare] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: null },
      ]);
      const userId = await newUserId();
      await fx.rate(userId, [{ movieId: liked, score: 9 }]);

      const result = await reason(userId, bare);

      // Another test file's embed sweep may give the bare movie a vector while
      // this test runs. Then the feed could score it, and so does this.
      if ((await fx.embeddedNow([bare])).length === 0) {
        expect(result).toEqual({ kind: "popular" });
      } else {
        expect(result).not.toBeNull();
      }
    });
  });

  describe("no reason (AC-7)", () => {
    it("gives null for a movie the feed could not show this user", async () => {
      const [liked, rated, skipped, noPoster, removed] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: between(0.9, 0, fx.privateDim()) },
        { vector: between(0.8, 0, fx.privateDim()) },
        { vector: between(0.7, 0, fx.privateDim()), poster: false },
        { vector: between(0.6, 0, fx.privateDim()), removed: true },
      ]);
      const userId = await newUserId();
      await fx.rate(userId, [
        { movieId: liked, score: 9 },
        { movieId: rated, score: 2 },
      ]);
      await fx.skip(userId, skipped);

      // The liked movie is rated too, so it has no reason either.
      expect(await reason(userId, liked)).toBeNull();
      expect(await reason(userId, rated)).toBeNull();
      expect(await reason(userId, skipped)).toBeNull();
      expect(await reason(userId, noPoster)).toBeNull();
      expect(await reason(userId, removed)).toBeNull();
      expect(await reason(userId, UNKNOWN_MOVIE_ID)).toBeNull();
    });

    it("reads only the given user's ratings: one user's rating does not hide the movie from another", async () => {
      const [liked, target] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: between(0.9, 0, fx.privateDim()) },
      ]);
      const alice = await newUserId();
      const bob = await newUserId();
      await fx.rate(alice, [
        { movieId: liked, score: 9 },
        { movieId: target, score: 8 },
      ]);
      await fx.rate(bob, [{ movieId: liked, score: 7 }]);

      expect(await reason(alice, target)).toBeNull();
      expect(await reason(bob, target)).toMatchObject({
        kind: "similar_to_liked",
        anchor: { movieId: liked, score: 7 },
      });
    });
  });

  describe("cost (AC-16, AC-17)", () => {
    it("runs four reads in one read only repeatable read transaction, whatever the rating count", async () => {
      if (!TEST_DATABASE_URL) throw new Error("DATABASE_URL_TEST is not set");
      const capture = capturingDb(TEST_DATABASE_URL);
      try {
        const [anchor, target] = await fx.addMovies([
          { vector: vec([[A, 1]]) },
          { vector: between(0.9, 0, fx.privateDim()) },
        ]);
        const extras = await fx.addMovies(
          Array.from({ length: 60 }, () => ({})),
        );
        const small = await newUserId();
        const large = await newUserId();
        await fx.rate(small, [{ movieId: anchor, score: 10 }]);
        await fx.rate(large, [
          { movieId: anchor, score: 10 },
          ...extras.map((movieId, i) => ({ movieId, score: i % 3 ? 8 : 3 })),
        ]);

        const run = async (userId: string) => {
          capture.log.length = 0;
          const value = await reason(userId, target, capture.db);
          return { value, statements: [...capture.log] };
        };
        const smallRun = await run(small);
        const largeRun = await run(large);

        for (const [userId, { value, statements }] of [
          [small, smallRun],
          [large, largeRun],
        ] as const) {
          expect(value).toMatchObject({ anchor: { movieId: anchor } });
          const texts = statements.map((s) => s.text.trim().toLowerCase());
          expect(texts[0]).toBe(
            "begin isolation level repeatable read read only",
          );
          expect(texts.at(-1)).toBe("commit");
          // begin, the eligibility read, two taste reads, the anchor read, commit.
          expect(statements).toHaveLength(6);
          expect(new Set(statements.map((s) => s.client)).size).toBe(1);
          expect(
            texts.filter((t) => /^(insert|update|delete)\b/.test(t)),
          ).toEqual([]);
          // Every read of ratings or skips binds this user's id.
          const userReads = statements.filter((s) =>
            /\b(ratings|swipe_skips)\b/.test(s.text),
          );
          expect(userReads.length).toBeGreaterThan(0);
          for (const read of userReads) expect(read.values).toContain(userId);
          // The anchor read is exact: it never orders by a bare distance.
          expect(texts.join("\n")).not.toMatch(/order by\s+\S+\s*<=>/);
        }
      } finally {
        await capture.pool.end();
      }
    });
  });
});

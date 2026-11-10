import { describe, expect, it } from "vitest";
import { useRecommendFixtures } from "@/test-support/recommend-fixtures";
import { TEST_DATABASE_URL, useTestDb } from "@/test-support/test-db";
import { popularCandidates } from "./popular-candidates";

describe.skipIf(!TEST_DATABASE_URL)("popularCandidates", () => {
  const ctx = useTestDb();
  const fx = useRecommendFixtures(() => ctx.db);

  /** The movies the current test kept visible. Other test files add movies at the same time. */
  let mine = new Set<number>();
  const popularMine = async (input: Parameters<typeof popularCandidates>[1]) =>
    (await popularCandidates(ctx.db, input)).filter((id) => mine.has(id));

  /** A fresh user, and the movies this test compares. */
  async function isolatedUser(keep: number[]) {
    const user = await ctx.fx.newUser();
    mine = new Set(keep);
    return user.id;
  }

  it("AC-8: orders by vote count from highest to lowest, then by movie id", async () => {
    const [low, high, twinOne, twinTwo] = await fx.addMovies([
      { voteCount: 1100000010 },
      { voteCount: 1100000900 },
      { voteCount: 1100000300 },
      { voteCount: 1100000300 },
    ]);
    const userId = await isolatedUser([low, high, twinOne, twinTwo]);

    const ids = await popularMine({
      userId,
      shown: [],
      limit: 50,
    });

    expect(ids).toEqual([
      high,
      Math.min(twinOne, twinTwo),
      Math.max(twinOne, twinTwo),
      low,
    ]);
  });

  // A null vote count sorts after every real count, so only a list that reaches the
  // end of the branch can show it.
  it("AC-8: puts a movie with no vote count last", async () => {
    const [nullOne, low, nullTwo] = await fx.addMovies([
      { voteCount: null },
      { voteCount: 1100000001 },
      { voteCount: null },
    ]);
    const userId = await isolatedUser([nullOne, low, nullTwo]);

    const ids = await popularMine({
      userId,
      shown: [],
      limit: 100_000,
    });

    expect(ids).toEqual([
      low,
      Math.min(nullOne, nullTwo),
      Math.max(nullOne, nullTwo),
    ]);
  });

  it("AC-8: allows a movie that has no embedding", async () => {
    const [plain] = await fx.addMovies([
      { vector: null, voteCount: 1100000050 },
    ]);
    const userId = await isolatedUser([plain]);

    const ids = await popularMine({
      userId,
      shown: [],
      limit: 50,
    });

    expect(ids).toEqual([plain]);
  });

  it("AC-2: leaves out rated, skipped, unlisted and shown movies", async () => {
    const [control, rated, skipped, noPoster, removed, shown] =
      await fx.addMovies([
        { voteCount: 1100000005 },
        { voteCount: 1100000600 },
        { voteCount: 1100000500 },
        { voteCount: 1100000400, poster: false },
        { voteCount: 1100000300, removed: true },
        { voteCount: 1100000200 },
      ]);
    const userId = await isolatedUser([
      control,
      rated,
      skipped,
      noPoster,
      removed,
      shown,
    ]);
    await fx.rate(userId, [{ movieId: rated, score: 7 }]);
    await fx.skip(userId, skipped);

    const ids = await popularMine({
      userId,
      shown: [shown],
      limit: 50,
    });

    expect(ids).toEqual([control]);
  });

  it("AC-1: returns at most the limit, keeping the most voted", async () => {
    const [a, b, c] = await fx.addMovies([
      { voteCount: 1100000030 },
      { voteCount: 1100000020 },
      { voteCount: 1100000010 },
    ]);
    const userId = await isolatedUser([a, b, c]);

    const all = await popularCandidates(ctx.db, {
      userId,
      shown: [],
      limit: 2,
    });

    // Another test file's movie may take a slot, so check the length, and that
    // this test's movies that made the cut are the most voted ones, in order.
    const ownOrder = all.filter((id) => mine.has(id));
    expect(all).toHaveLength(2);
    expect(ownOrder).toEqual([a, b, c].slice(0, ownOrder.length));
  });

  it("AC-15 AC-12: accepts a long list of shown ids", async () => {
    const [a, b] = await fx.addMovies([
      { voteCount: 1100000002 },
      { voteCount: 1100000001 },
    ]);
    const userId = await isolatedUser([a, b]);
    const shown = Array.from({ length: 500 }, (_, i) => i + 1);

    const ids = await popularMine({
      userId,
      shown: [...shown, a],
      limit: 100,
    });

    expect(ids).toEqual([b]);
  });
});

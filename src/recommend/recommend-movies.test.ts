import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb } from "@/db/create-db";
import { setFeedback } from "@/feedback/feedback";
import {
  capturingDb,
  near,
  useRecommendFixtures,
  vec,
} from "@/test-support/recommend-fixtures";
import {
  forbiddenDb,
  TEST_DATABASE_URL,
  useTestDb,
} from "@/test-support/test-db";
import { type RecommendInput, recommendMovies } from "./recommend-movies";
import type { Recommendations } from "./types";

/** Anchors sit on low dimensions, so a test controls every similarity. */
const A = 192;
const B = 193;

/**
 * Popular picks come from the whole branch, which may hold a real catalog. Test
 * movies that must show up in a popular list get vote counts above any real
 * movie (and below the 2 billion other test files use), as load-deck.test.ts does.
 */
const TOP_VOTES = 1_000_000_000;

describe.skipIf(!TEST_DATABASE_URL)("recommendMovies", () => {
  const ctx = useTestDb();
  const fx = useRecommendFixtures(() => ctx.db, { band: 1, privateFrom: 224 });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The movies each test user is compared on. Other test files add movies at the same time. */
  const visibleTo = new Map<string, number[]>();

  /**
   * Calls `recommendMovies` and fails the test with the code when it errors.
   * Picks are cut to the movies this test made for the user: other test files
   * create movies in the shared branch while this one runs, and a low scoring
   * stranger can appear at the end of a long list.
   */
  async function recommend(
    input: RecommendInput,
    db = ctx.db,
  ): Promise<Recommendations> {
    const result = await recommendMovies(db, input);
    if (!result.ok)
      throw new Error(`recommendMovies failed: ${result.error.code}`);
    const visible = visibleTo.get(input.userId);
    if (!visible) return result.value;
    return {
      ...result.value,
      picks: result.value.picks.filter((p) => visible.includes(p.movie.id)),
    };
  }

  const idsOf = (value: Recommendations) => value.picks.map((p) => p.movie.id);

  /** A fresh user, compared on the movies in `keep` only. */
  async function isolatedUser(keep: number[]) {
    const user = await ctx.fx.newUser();
    visibleTo.set(user.id, keep);
    return user.id;
  }

  describe("taste picks", () => {
    it("AC-1 AC-3 AC-6: ranks the closest movie first and names the liked movie it came from", async () => {
      const [liked, disliked, close, neutral, nearDisliked] =
        await fx.addMovies([
          { vector: vec([[A, 1]]), releaseDate: "1995-12-15" },
          { vector: vec([[B, 1]]) },
          { vector: vec([[A, 1]]) },
          { vector: near(A, 0.7, fx.privateDim()) },
          {
            vector: vec([
              [A, 0.7],
              [B, 0.5],
              [fx.privateDim(), Math.sqrt(0.26)],
            ]),
          },
        ]);
      const userId = await isolatedUser([
        liked,
        disliked,
        close,
        neutral,
        nearDisliked,
      ]);
      await fx.rate(userId, [
        { movieId: liked, score: 9 },
        { movieId: disliked, score: 2 },
      ]);

      const result = await recommend({ userId, limit: 50 });

      expect(idsOf(result)).toEqual([close, neutral, nearDisliked]);
      for (const pick of result.picks) {
        expect(pick.reason).toEqual({
          kind: "similar_to_liked",
          anchor: {
            movieId: liked,
            title: expect.stringMatching(/^Rec Test /),
            releaseYear: 1995,
            score: 9,
          },
        });
      }
    });

    it("AC-1: gives the same list in the same order on a second call", async () => {
      const ids = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        ...Array.from({ length: 6 }, (_, i) => ({
          vector: near(A, 0.9 - i * 0.05, fx.privateDim()),
        })),
      ]);
      const userId = await isolatedUser(ids);
      await fx.rate(userId, [{ movieId: ids[0], score: 9 }]);

      const first = await recommend({ userId, limit: 50 });
      const second = await recommend({ userId, limit: 50 });

      expect(second).toEqual(first);
      expect(first.picks).toHaveLength(6);
    });

    it("AC-1: breaks a tie in score by the lower movie id", async () => {
      const twin = near(A, 0.6, fx.privateDim());
      const [liked, one, two] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: twin },
        { vector: twin },
      ]);
      const userId = await isolatedUser([liked, one, two]);
      await fx.rate(userId, [{ movieId: liked, score: 9 }]);

      const result = await recommend({ userId });

      expect(idsOf(result)).toEqual([Math.min(one, two), Math.max(one, two)]);
    });

    it("AC-1: returns at most 20 picks by default and at most the limit when given", async () => {
      const ids = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        ...Array.from({ length: 25 }, (_, i) => ({
          vector: near(A, 0.95 - i * 0.01, fx.privateDim()),
        })),
      ]);
      const userId = await isolatedUser(ids);
      await fx.rate(userId, [{ movieId: ids[0], score: 9 }]);
      // The raw result: the count is the contract, whoever else is in the branch.
      const count = async (limit?: number) => {
        const result = await recommendMovies(ctx.db, { userId, limit });
        if (!result.ok) throw new Error(result.error.code);
        return result.value.picks.length;
      };

      expect(await count()).toBe(20);
      expect(await count(3)).toBe(3);
      // Our own candidates are 25; the rest of the 50 come from other movies.
      const largest = await count(50);
      expect(largest).toBeGreaterThanOrEqual(25);
      expect(largest).toBeLessThanOrEqual(50);
      expect(await count(1)).toBe(1);
    });

    it("AC-1: ranks this user's candidates best first", async () => {
      const [liked, best, middle, worst] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: near(A, 0.95, fx.privateDim()) },
        { vector: near(A, 0.8, fx.privateDim()) },
        { vector: near(A, 0.6, fx.privateDim()) },
      ]);
      const userId = await isolatedUser([liked, best, middle, worst]);
      await fx.rate(userId, [{ movieId: liked, score: 9 }]);

      const result = await recommend({ userId, limit: 50 });

      expect(idsOf(result)).toEqual([best, middle, worst]);
    });

    it("AC-6 AC-3: never uses a disliked movie as a reason, and ranks a movie near it last", async () => {
      const [liked, disliked, firstPick, secondPick, nearDisliked] =
        await fx.addMovies([
          { vector: vec([[A, 1]]) },
          { vector: vec([[B, 1]]) },
          { vector: near(A, 0.6, fx.privateDim()) },
          { vector: near(A, 0.5, fx.privateDim()) },
          { vector: near(B, 0.95, fx.privateDim()) },
        ]);
      const userId = await isolatedUser([
        liked,
        disliked,
        firstPick,
        secondPick,
        nearDisliked,
      ]);
      await fx.rate(userId, [
        { movieId: liked, score: 7 },
        { movieId: disliked, score: 1 },
      ]);

      const result = await recommend({ userId, limit: 50 });

      // The movie near the disliked one scores below zero, so it ranks under
      // every neutral movie. In a branch with many movies it is not among the
      // top 50 at all; in a small one it shows up, but last.
      const order = idsOf(result);
      expect(order.slice(0, 2)).toEqual([firstPick, secondPick]);
      expect([-1, 2]).toContain(order.indexOf(nearDisliked));
      for (const pick of result.picks) {
        expect(pick.reason).toMatchObject({
          kind: "similar_to_liked",
          anchor: { movieId: liked, score: 7 },
        });
      }
    });

    it("AC-2: never picks a movie the user rated, skipped, that is not listable or already shown", async () => {
      const [liked, control, rated, skipped, noPoster, removed, shown] =
        await fx.addMovies([
          { vector: vec([[A, 1]]) },
          { vector: near(A, 0.8, fx.privateDim()) },
          { vector: near(A, 0.8, fx.privateDim()) },
          { vector: near(A, 0.8, fx.privateDim()) },
          { vector: near(A, 0.8, fx.privateDim()), poster: false },
          { vector: near(A, 0.8, fx.privateDim()), removed: true },
          { vector: near(A, 0.8, fx.privateDim()) },
        ]);
      const userId = await isolatedUser([
        liked,
        control,
        rated,
        skipped,
        noPoster,
        removed,
        shown,
      ]);
      await fx.rate(userId, [
        { movieId: liked, score: 9 },
        { movieId: rated, score: 4 },
      ]);
      await fx.skip(userId, skipped);

      const result = await recommend({ userId, shown: [shown] });

      expect(idsOf(result)).toEqual([control]);
    });

    it("AC-13: leaves out a movie with no embedding or an embedding for another model", async () => {
      const [liked, control, plain, otherModel] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: near(A, 0.5, fx.privateDim()) },
        { vector: null },
        { vector: near(A, 0.9, fx.privateDim()), model: "test-other-model" },
      ]);
      const userId = await isolatedUser([liked, control, plain, otherModel]);
      await fx.rate(userId, [{ movieId: liked, score: 9 }]);

      const result = await recommend({ userId });

      // Another test file's embed sweep may have given these two a vector of its
      // own since they were made; if so they are fair candidates.
      const swept = await fx.embeddedNow([plain, otherModel]);
      expect(idsOf(result).filter((id) => !swept.includes(id))).toEqual([
        control,
      ]);
    });

    it("AC-7 AC-13: counts nothing for a rated movie the catalog withdrew", async () => {
      const [withdrawn, candidate] = await fx.addMovies([
        { vector: null, removed: true },
        { vector: near(A, 0.5, fx.privateDim()) },
      ]);
      const userId = await isolatedUser([withdrawn, candidate]);
      await fx.rate(userId, [{ movieId: withdrawn, score: 10 }]);

      const result = await recommend({ userId });

      expect(result.profile.likedCount).toBe(0);
      expect(result.profile.strength).toBe("none");
    });
  });

  describe("taste summary", () => {
    it("AC-7: reports none, thin, thin and ok for 0, 1, 4 and 5 liked movies", async () => {
      const anchors = await fx.addMovies(
        Array.from({ length: 5 }, (_, i) => ({ vector: vec([[194 + i, 1]]) })),
      );
      const candidate = await fx.addMovie({
        vector: near(194, 0.8, fx.privateDim()),
      });
      const strengths: Record<number, string> = {};

      for (const liked of [0, 1, 4, 5]) {
        const userId = await isolatedUser([...anchors, candidate]);
        await fx.rate(
          userId,
          anchors.slice(0, liked).map((movieId) => ({ movieId, score: 9 })),
        );
        strengths[liked] = (await recommend({ userId })).profile.strength;
      }

      expect(strengths).toEqual({ 0: "none", 1: "thin", 4: "thin", 5: "ok" });
    });

    it("AC-7: counts every liked and disliked movie, not only the anchors", async () => {
      const liked = await fx.addMovies(Array.from({ length: 35 }, () => ({})));
      const disliked = await fx.addMovies(
        Array.from({ length: 15 }, () => ({})),
      );
      const candidate = await fx.addMovie({
        vector: near(194, 0.8, fx.privateDim()),
      });
      const userId = await isolatedUser([...liked, ...disliked, candidate]);
      await fx.rate(userId, [
        ...liked.map((movieId) => ({ movieId, score: 8 })),
        ...disliked.map((movieId) => ({ movieId, score: 3 })),
      ]);

      const result = await recommend({ userId });

      expect(result.profile).toEqual({
        likedCount: 35,
        dislikedCount: 15,
        strength: "ok",
      });
    });

    it("AC-9: ranks the same way with thin and ok taste, and only the flag differs", async () => {
      const anchors = await fx.addMovies(
        Array.from({ length: 5 }, (_, i) => ({ vector: vec([[200 + i, 1]]) })),
      );
      const disliked = await fx.addMovie({ vector: vec([[205, 1]]) });
      // Every rule is in play: closeness, a dislike penalty and the vote nudge.
      const candidates = await fx.addMovies([
        { vector: near(200, 0.9, fx.privateDim()) },
        { vector: near(201, 0.85, fx.privateDim()) },
        {
          vector: near(202, 0.8, fx.privateDim()),
          voteAverage: 10,
          voteCount: 5000,
        },
        { vector: near(203, 0.75, fx.privateDim()) },
        {
          vector: vec([
            [203, 0.75],
            [205, 0.5],
            [fx.privateDim(), Math.sqrt(0.1875)],
          ]),
        },
      ]);
      const keep = [...anchors, disliked, ...candidates];
      const thinUser = await isolatedUser(keep);
      const okUser = await isolatedUser(keep);
      const dislike = [{ movieId: disliked, score: 2 }];
      await fx.rate(thinUser, [
        ...anchors.slice(0, 4).map((movieId) => ({ movieId, score: 9 })),
        ...dislike,
      ]);
      await fx.rate(okUser, [
        ...anchors.map((movieId) => ({ movieId, score: 9 })),
        ...dislike,
      ]);

      const thin = await recommend({ userId: thinUser, limit: 50 });
      const ok = await recommend({ userId: okUser, limit: 50 });

      expect(thin.profile.strength).toBe("thin");
      expect(ok.profile.strength).toBe("ok");
      // The thin user's fifth anchor is unrated, so it is a candidate too (last).
      const onlyCandidates = (value: Recommendations) =>
        idsOf(value).filter((id) => candidates.includes(id));
      expect(onlyCandidates(thin).length).toBeGreaterThanOrEqual(4);
      expect(onlyCandidates(ok)).toEqual(onlyCandidates(thin));
    });
  });

  describe("popular fallback", () => {
    it("AC-8: gives the most voted movies, reason popular, when there is no liked movie", async () => {
      const [mostVoted, lessVoted, plain] = await fx.addMovies([
        { voteCount: TOP_VOTES + 900 },
        { voteCount: TOP_VOTES + 100 },
        { vector: null, voteCount: TOP_VOTES + 500 },
      ]);
      const disliked = await fx.addMovie({ vector: vec([[B, 1]]) });
      const keep = [mostVoted, lessVoted, plain, disliked];
      const noRatings = await isolatedUser(keep);
      const onlyDislikes = await isolatedUser(keep);
      await fx.rate(onlyDislikes, [{ movieId: disliked, score: 2 }]);

      for (const userId of [noRatings, onlyDislikes]) {
        const result = await recommend({ userId, limit: 50 });

        const four = [mostVoted, lessVoted, plain];
        expect(idsOf(result).filter((id) => four.includes(id))).toEqual([
          mostVoted,
          plain,
          lessVoted,
        ]);
        expect(result.profile.strength).toBe("none");
        expect(result.picks.every((p) => p.reason.kind === "popular")).toBe(
          true,
        );
      }
    });

    it("AC-7: counts the dislikes even when the user has no liked movie", async () => {
      const [disliked, other] = await fx.addMovies([
        { vector: vec([[B, 1]]) },
        {},
      ]);
      const userId = await isolatedUser([disliked, other]);
      await fx.rate(userId, [{ movieId: disliked, score: 2 }]);

      const result = await recommend({ userId });

      expect(result.profile).toEqual({
        likedCount: 0,
        dislikedCount: 1,
        strength: "none",
      });
    });

    it("AC-7 AC-8 AC-13: treats liked movies with no embedding as no taste at all", async () => {
      const [unembeddedLike, popular] = await fx.addMovies([
        // Withdrawn, so the catalog's embed sweep (run by other test files) never gives it a vector.
        { vector: null, removed: true },
        { voteCount: TOP_VOTES + 50 },
      ]);
      const userId = await isolatedUser([unembeddedLike, popular]);
      await fx.rate(userId, [{ movieId: unembeddedLike, score: 10 }]);

      const result = await recommend({ userId, limit: 50 });

      expect(result.profile).toEqual({
        likedCount: 0,
        dislikedCount: 0,
        strength: "none",
      });
      expect(idsOf(result)).toEqual([popular]);
      expect(result.picks[0].reason).toEqual({ kind: "popular" });
    });
  });

  describe("variety", () => {
    /** 7 liked anchors, 22 lookalikes of the first, 3 lookalikes of each other one. */
    async function varietyCatalog() {
      const anchors = await fx.addMovies(
        Array.from({ length: 7 }, (_, i) => ({ vector: vec([[206 + i, 1]]) })),
      );
      // Lookalikes of one anchor share a private dimension: only their closeness
      // to the anchor matters, and ties between them break by movie id.
      const firstPrivate = fx.privateDim();
      const lookalikes = await fx.addMovies([
        ...Array.from({ length: 22 }, () => ({
          vector: near(206, 0.99, firstPrivate),
        })),
        ...anchors.slice(1).flatMap((_, k) => {
          const shared = fx.privateDim();
          return Array.from({ length: 3 }, () => ({
            vector: near(207 + k, 0.7, shared),
          }));
        }),
      ]);
      return { anchors, keep: [...anchors, ...lookalikes] };
    }

    const perAnchor = (result: Recommendations) => {
      const counts = new Map<number, number>();
      for (const pick of result.picks) {
        if (pick.reason.kind !== "similar_to_liked") continue;
        const id = pick.reason.anchor.movieId;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return counts;
    };

    it("AC-11: keeps one anchor to 3 picks of 20 when 7 anchors have lookalikes", async () => {
      const { anchors, keep } = await varietyCatalog();
      const userId = await isolatedUser(keep);
      await fx.rate(
        userId,
        anchors.map((movieId) => ({ movieId, score: 10 })),
      );

      const result = await recommend({ userId, limit: 20 });

      expect(result.picks).toHaveLength(20);
      expect(Math.max(...perAnchor(result).values())).toBeLessThanOrEqual(3);
      expect(perAnchor(result).size).toBe(7);
    });

    it("AC-11 AC-1: holds one anchor to the cap of 10 with 2 anchors while others remain, gives the other its picks, and sorts by score", async () => {
      const { anchors, keep } = await varietyCatalog();
      const userId = await isolatedUser(keep);
      await fx.rate(
        userId,
        anchors.slice(0, 2).map((movieId) => ({ movieId, score: 10 })),
      );

      const result = await recommend({ userId, limit: 20 });

      const reasons = result.picks.map((p) =>
        p.reason.kind === "similar_to_liked" ? p.reason.anchor.movieId : null,
      );
      // The cap is 10. Other candidates always remain on a shared branch, so the
      // pass that ignores the cap does not run here (the pure tests cover it).
      // On a small branch the batch is filled past the cap, so this is a floor.
      expect(perAnchor(result).get(anchors[0])).toBeGreaterThanOrEqual(10);
      expect(perAnchor(result).get(anchors[1])).toBe(3);
      // The closer picks (0.99) sort ahead of the three further ones (0.7).
      expect(reasons.lastIndexOf(anchors[0])).toBeLessThan(
        reasons.indexOf(anchors[1]),
      );
    });

    it("AC-11: fills a whole batch from one anchor when it is the only liked movie", async () => {
      const { anchors, keep } = await varietyCatalog();
      const userId = await isolatedUser(keep);
      await fx.rate(userId, [{ movieId: anchors[0], score: 10 }]);

      const result = await recommend({ userId, limit: 20 });

      expect(result.picks).toHaveLength(20);
      expect(perAnchor(result).get(anchors[0])).toBe(20);
    });
  });

  describe("paging", () => {
    it("AC-12: gives the next picks for shown ids without repeating, even after a rating in between", async () => {
      const [liked, ...candidates] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        ...Array.from({ length: 8 }, (_, i) => ({
          vector: near(A, 0.95 - i * 0.02, fx.privateDim()),
        })),
      ]);
      const userId = await isolatedUser([liked, ...candidates]);
      await fx.rate(userId, [{ movieId: liked, score: 9 }]);

      const page1 = await recommend({ userId, limit: 3 });
      const page2 = await recommend({ userId, limit: 3, shown: idsOf(page1) });
      const shown = [...idsOf(page1), ...idsOf(page2)];
      // Rate the next best movie between the two calls.
      const nextBest = candidates[6];
      await fx.rate(userId, [{ movieId: nextBest, score: 3 }]);
      const page3 = await recommend({ userId, limit: 3, shown });

      expect(idsOf(page1)).toEqual(candidates.slice(0, 3));
      expect(idsOf(page2)).toEqual(candidates.slice(3, 6));
      expect(idsOf(page3)).toEqual([candidates[7]]);
      expect(new Set([...shown, ...idsOf(page3)]).size).toBe(7);
    });

    it("AC-15: treats duplicate shown ids like a list without duplicates", async () => {
      const [liked, ...candidates] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        ...Array.from({ length: 4 }, (_, i) => ({
          vector: near(A, 0.9 - i * 0.05, fx.privateDim()),
        })),
      ]);
      const userId = await isolatedUser([liked, ...candidates]);
      await fx.rate(userId, [{ movieId: liked, score: 9 }]);
      const shown = [candidates[0], candidates[1]];

      const unique = await recommend({ userId, shown });
      const duplicated = await recommend({
        userId,
        shown: [...shown, ...shown, candidates[0]],
      });

      expect(duplicated).toEqual(unique);
      expect(idsOf(unique)).toEqual(candidates.slice(2));
    });

    it("AC-14: changes the result when a rating is saved just before a call, with nothing stored", async () => {
      const [liked, close, middle, far] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: near(A, 0.9, fx.privateDim()) },
        { vector: near(A, 0.7, fx.privateDim()) },
        { vector: near(A, 0.5, fx.privateDim()) },
      ]);
      const userId = await isolatedUser([liked, close, middle, far]);
      await fx.rate(userId, [{ movieId: liked, score: 9 }]);

      const before = await recommend({ userId });
      await fx.rate(userId, [{ movieId: close, score: 8 }]);
      const after = await recommend({ userId });

      expect(idsOf(before)).toEqual([close, middle, far]);
      expect(idsOf(after)).toEqual([middle, far]);
      expect(after.profile.likedCount).toBe(2);
    });
  });

  describe("input and failures", () => {
    const nobody = "user-that-is-never-read";
    const invalid = [
      ["a limit of 0", { userId: nobody, limit: 0 }],
      ["a limit of 51", { userId: nobody, limit: 51 }],
      ["a limit of 2.5", { userId: nobody, limit: 2.5 }],
      ["a negative limit", { userId: nobody, limit: -1 }],
      ["an empty user id", { userId: "" }],
      [
        "501 shown ids",
        { userId: nobody, shown: Array.from({ length: 501 }, (_, i) => i + 1) },
      ],
      ["a shown id of 0", { userId: nobody, shown: [0] }],
      ["a negative shown id", { userId: nobody, shown: [-4] }],
      ["a fractional shown id", { userId: nobody, shown: [1.5] }],
      [
        "a shown id above the largest safe integer",
        { userId: nobody, shown: [Number.MAX_SAFE_INTEGER + 2] },
      ],
    ] as const;

    it.each(invalid)(
      "AC-15: returns invalid_input for %s without reading anything",
      async (_name, input) => {
        const result = await recommendMovies(
          forbiddenDb,
          input as RecommendInput,
        );

        expect(result).toEqual({ ok: false, error: { code: "invalid_input" } });
      },
    );

    it("AC-15: returns db_unavailable, and does not throw, when the database cannot be reached", async () => {
      const dead = createDb("postgres://nobody:nothing@127.0.0.1:1/none", {
        max: 1,
      });
      try {
        const result = await recommendMovies(dead.db, { userId: nobody });

        expect(result).toEqual({
          ok: false,
          error: { code: "db_unavailable" },
        });
      } finally {
        await dead.pool.end();
      }
    });

    it("AC-15: accepts the largest allowed limit and 500 shown ids", async () => {
      const user = await ctx.fx.newUser();
      const userId = user.id;

      const result = await recommendMovies(ctx.db, {
        userId,
        limit: 50,
        shown: Array.from({ length: 500 }, (_, i) => i + 1),
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("privacy and cost", () => {
    it("AC-16: gives each user picks from their own ratings only", async () => {
      const [likedA, likedB, nearA, nearB] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: vec([[B, 1]]) },
        { vector: near(A, 0.9, fx.privateDim()) },
        { vector: near(B, 0.9, fx.privateDim()) },
      ]);
      const keep = [likedA, likedB, nearA, nearB];
      const alice = await isolatedUser(keep);
      const bob = await isolatedUser(keep);
      await fx.rate(alice, [{ movieId: likedA, score: 9 }]);
      await fx.rate(bob, [{ movieId: likedB, score: 9 }]);

      const aliceResult = await recommend({ userId: alice, limit: 1 });
      const bobResult = await recommend({ userId: bob, limit: 1 });

      expect(idsOf(aliceResult)).toEqual([nearA]);
      expect(idsOf(bobResult)).toEqual([nearB]);
    });

    it("AC-16 AC-17 AC-19: runs the same number of reads in one read only repeatable read transaction whatever the ratings and limit", async () => {
      if (!TEST_DATABASE_URL) throw new Error("DATABASE_URL_TEST is not set");
      const capture = capturingDb(TEST_DATABASE_URL);
      try {
        const base = await fx.addMovies([
          { vector: vec([[214, 1]]) },
          { vector: vec([[215, 1]]) },
          { vector: vec([[216, 1]]) },
          { vector: vec([[217, 1]]) },
          { vector: vec([[218, 1]]) },
        ]);
        const extras = await fx.addMovies(
          Array.from({ length: 55 }, () => ({})),
        );
        const candidates = await fx.addMovies(
          Array.from({ length: 10 }, (_, i) => ({
            vector: near(214, 0.9 - i * 0.05, fx.privateDim()),
          })),
        );
        const keep = [...base, ...extras, ...candidates];
        const small = await isolatedUser(keep);
        const large = await isolatedUser(keep);
        await fx.rate(
          small,
          base.map((movieId, i) => ({ movieId, score: i < 3 ? 9 : 2 })),
        );
        await fx.rate(large, [
          ...base.map((movieId, i) => ({ movieId, score: i < 3 ? 9 : 2 })),
          ...extras.map((movieId, i) => ({ movieId, score: i % 3 ? 8 : 3 })),
        ]);
        const consoleSpies = (
          ["log", "info", "warn", "error", "debug"] as const
        ).map((method) => vi.spyOn(console, method));

        const run = async (userId: string, limit: number) => {
          capture.log.length = 0;
          const result = await recommend({ userId, limit }, capture.db);
          return { result, statements: [...capture.log] };
        };
        const smallRun = await run(small, 5);
        const largeRun = await run(large, 50);

        const consoleCalls = consoleSpies.reduce(
          (total, spy) => total + spy.mock.calls.length,
          0,
        );
        for (const spy of consoleSpies) spy.mockRestore();
        // Both calls did real taste work, so the comparison is not empty.
        expect(smallRun.result.picks.length).toBeGreaterThan(0);
        expect(largeRun.result.picks.length).toBeGreaterThan(0);
        expect(smallRun.result.profile.dislikedCount).toBe(2);
        expect(largeRun.result.profile.likedCount).toBeGreaterThan(3);

        // AC-17: the statement count does not grow with ratings or limit.
        expect(largeRun.statements.length).toBe(smallRun.statements.length);
        // AC-19: one connection, one read only repeatable read transaction.
        for (const { statements } of [smallRun, largeRun]) {
          expect(statements[0].text.trim().toLowerCase()).toBe(
            "begin isolation level repeatable read read only",
          );
          expect(statements.at(-1)?.text.trim().toLowerCase()).toBe("commit");
          expect(new Set(statements.map((s) => s.client)).size).toBe(1);
          // AC-14 AC-16: it only reads.
          expect(
            statements.filter((s) =>
              /^\s*(insert|update|delete)\b/i.test(s.text),
            ),
          ).toEqual([]);
        }
        // AC-16: every read of ratings or swipe_skips binds the given user id.
        for (const [userId, { statements }] of [
          [small, smallRun],
          [large, largeRun],
        ] as const) {
          const userReads = statements.filter((s) =>
            /\b(ratings|swipe_skips)\b/.test(s.text),
          );
          expect(userReads.length).toBeGreaterThan(0);
          for (const read of userReads) {
            expect(read.values).toContain(userId);
          }
        }
        // AC-16: nothing about ratings reaches a log line.
        expect(consoleCalls).toBe(0);
      } finally {
        await capture.pool.end();
      }
    });
  });

  describe("feed feedback (spec 0011)", () => {
    const ask = (userId: string, movieId: number) =>
      setFeedback(ctx.db, { userId, movieId, kind: "more_like_this" });

    it("AC-9: gives taste picks, not popular, to a user whose only signal is one More like this", async () => {
      const [asked, close] = await fx.addMovies([
        { vector: vec([[A, 1]]), releaseDate: "1995-12-15" },
        { vector: near(A, 0.9, fx.privateDim()) },
      ]);
      const userId = await isolatedUser([asked, close]);
      await ask(userId, asked);

      const result = await recommend({ userId, limit: 50 });

      expect(result.profile.strength).toBe("thin");
      expect(result.profile.likedCount).toBe(0);
      expect(
        result.picks.find((p) => p.movie.id === close)?.reason,
      ).toMatchObject({
        kind: "more_like_this",
        anchor: { movieId: asked, releaseYear: 1995 },
      });
    });

    it("AC-9: counts More like this anchors toward the ok strength", async () => {
      const liked = await fx.addMovies([{}, {}]);
      const asked = await fx.addMovies([{}, {}, {}]);
      const userId = await isolatedUser([...liked, ...asked]);
      await fx.rate(
        userId,
        liked.map((movieId) => ({ movieId, score: 9 })),
      );
      for (const movieId of asked) await ask(userId, movieId);

      const result = await recommend({ userId, limit: 5 });

      expect(result.profile.likedCount).toBe(2);
      expect(result.profile.strength).toBe("ok");
    });

    it("AC-6: ranks a More like this movie's neighbour higher than it ranked before", async () => {
      const [loved, asked, nearLoved, nearAsked] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: vec([[B, 1]]) },
        { vector: near(A, 0.8, fx.privateDim()) },
        { vector: near(B, 0.95, fx.privateDim()) },
      ]);
      const userId = await isolatedUser([loved, asked, nearLoved, nearAsked]);
      await fx.rate(userId, [{ movieId: loved, score: 9 }]);
      const order = async () =>
        idsOf(await recommend({ userId, limit: 50 })).filter((id) =>
          [nearLoved, nearAsked].includes(id),
        );

      const before = await order();
      await ask(userId, asked);
      const after = await order();

      expect(before[0]).toBe(nearLoved);
      expect(after[0]).toBe(nearAsked);
    });

    it("AC-4: never picks a movie marked not interested, however close it is", async () => {
      const [loved, twin] = await fx.addMovies([
        { vector: vec([[A, 1]]) },
        { vector: vec([[A, 1]]) },
      ]);
      const userId = await isolatedUser([loved, twin]);
      await fx.rate(userId, [{ movieId: loved, score: 10 }]);
      await setFeedback(ctx.db, {
        userId,
        movieId: twin,
        kind: "not_interested",
      });

      expect(idsOf(await recommend({ userId, limit: 50 }))).toEqual([]);
    });

    it("AC-4: never picks a movie marked not interested in the popular fallback", async () => {
      const [dismissed] = await fx.addMovies([{ voteCount: TOP_VOTES }]);
      const userId = await isolatedUser([dismissed]);
      await setFeedback(ctx.db, {
        userId,
        movieId: dismissed,
        kind: "not_interested",
      });

      expect(idsOf(await recommend({ userId, limit: 50 }))).toEqual([]);
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { useRecommendFixtures, vec } from "@/test-support/recommend-fixtures";
import { TEST_DATABASE_URL, useTestDb } from "@/test-support/test-db";
import { recommendMovies } from "./recommend-movies";

/**
 * Taste mode finding no candidate at all (AC-18) cannot be reached on the shared
 * test branch, because other test files keep embedded movies in it. So this file
 * makes only the scoring read come back empty, the way a catalog with no
 * embeddings yet would, and runs everything else against the real database.
 */
vi.mock("./score-candidates", () => ({
  scoreCandidates: vi.fn().mockResolvedValue([]),
}));

describe.skipIf(!TEST_DATABASE_URL)(
  "recommendMovies without a taste candidate",
  () => {
    const ctx = useTestDb();
    const fx = useRecommendFixtures(() => ctx.db, { band: 2 });

    it("AC-18: falls back to popular when taste finds no candidate, and still reports the real strength", async () => {
      const [liked, plain] = await fx.addMovies([
        { vector: vec([[256, 1]]) },
        // Above any real movie, so it leads the popular list.
        { vector: null, voteCount: 1_200_000_000 },
      ]);
      const user = await ctx.fx.newUser();
      await fx.rate(user.id, [{ movieId: liked, score: 9 }]);

      const result = await recommendMovies(ctx.db, {
        userId: user.id,
        limit: 50,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.profile).toEqual({
        likedCount: 1,
        dislikedCount: 0,
        strength: "thin",
      });
      expect(result.value.picks.map((p) => p.movie.id)).toContain(plain);
      expect(result.value.picks.every((p) => p.reason.kind === "popular")).toBe(
        true,
      );
    });
  },
);

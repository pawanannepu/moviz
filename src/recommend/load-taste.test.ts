import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { movieEmbeddings, movies } from "@/db/schema";
import { useRecommendFixtures } from "@/test-support/recommend-fixtures";
import { TEST_DATABASE_URL, useTestDb } from "@/test-support/test-db";
import { loadTaste } from "./load-taste";
import { ratingWeight } from "./rules";

describe.skipIf(!TEST_DATABASE_URL)("loadTaste", () => {
  const ctx = useTestDb();
  const fx = useRecommendFixtures(() => ctx.db);
  const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

  it("AC-4: weights each rating the same whatever its source", async () => {
    const user = await ctx.fx.newUser();
    const [swipeLike, swipeDislike, manualTen, importOne] = await fx.addMovies([
      {},
      {},
      {},
      {},
    ]);
    await fx.rate(user.id, [
      { movieId: swipeLike, score: 8, source: "swipe" },
      { movieId: swipeDislike, score: 2, source: "swipe" },
      { movieId: manualTen, score: 10, source: "manual" },
      { movieId: importOne, score: 1, source: "import" },
    ]);

    const taste = await loadTaste(ctx.db, user.id);

    const weights = new Map(
      [...taste.liked, ...taste.disliked].map((a) => [a.movieId, a.weight]),
    );
    expect(weights.get(swipeLike)).toBeCloseTo(0.5556, 4);
    expect(weights.get(swipeDislike)).toBeCloseTo(-0.7778, 4);
    expect(weights.get(manualTen)).toBe(1);
    expect(weights.get(importOne)).toBe(-1);
  });

  it("AC-6: gives each anchor its id, title, release year and the user's own score", async () => {
    const user = await ctx.fx.newUser();
    const movieId = await fx.addMovie({ releaseDate: "1995-12-15" });
    await fx.rate(user.id, [{ movieId, score: 9 }]);
    const [{ title }] = await ctx.db
      .select({ title: movies.title })
      .from(movies)
      .where(eq(movies.id, movieId));

    const taste = await loadTaste(ctx.db, user.id);

    expect(taste.liked).toEqual([
      {
        movieId,
        title,
        releaseYear: 1995,
        score: 9,
        weight: ratingWeight(9),
      },
    ]);
  });

  it("AC-6: gives a null release year for a movie with no release date", async () => {
    const user = await ctx.fx.newUser();
    const movieId = await fx.addMovie({ releaseDate: null });
    await fx.rate(user.id, [{ movieId, score: 7 }]);

    const taste = await loadTaste(ctx.db, user.id);

    expect(taste.liked[0].releaseYear).toBeNull();
  });

  it("AC-5: loads ids and numbers only, never an embedding", async () => {
    const user = await ctx.fx.newUser();
    const movieId = await fx.addMovie();
    await fx.rate(user.id, [{ movieId, score: 9 }]);

    const taste = await loadTaste(ctx.db, user.id);

    expect(Object.keys(taste.liked[0]).sort()).toEqual([
      "movieId",
      "releaseYear",
      "score",
      "title",
      "weight",
    ]);
  });

  it("AC-5 AC-7: uses the 30 strongest liked and 10 strongest disliked, and counts them all", async () => {
    const user = await ctx.fx.newUser();
    const base = Date.now();
    const likedIds = await fx.addMovies(Array.from({ length: 35 }, () => ({})));
    const dislikedIds = await fx.addMovies(
      Array.from({ length: 15 }, () => ({})),
    );
    const likedRows = likedIds.map((movieId, i) => ({
      movieId,
      score: 6 + (i % 5),
      updatedAt: new Date(base - i * 60_000),
    }));
    const dislikedRows = dislikedIds.map((movieId, i) => ({
      movieId,
      score: 1 + (i % 5),
      updatedAt: new Date(base - i * 60_000),
    }));
    await fx.rate(user.id, [...likedRows, ...dislikedRows]);
    // Strongest: largest absolute weight, then newest update, then highest id.
    const strongest = (rows: typeof likedRows, count: number) =>
      [...rows]
        .sort(
          (a, b) =>
            Math.abs(b.score - 5.5) - Math.abs(a.score - 5.5) ||
            b.updatedAt.getTime() - a.updatedAt.getTime() ||
            b.movieId - a.movieId,
        )
        .slice(0, count)
        .map((row) => row.movieId);

    const taste = await loadTaste(ctx.db, user.id);

    expect(taste.likedCount).toBe(35);
    expect(taste.dislikedCount).toBe(15);
    expect(sorted(taste.liked.map((a) => a.movieId))).toEqual(
      sorted(strongest(likedRows, 30)),
    );
    expect(sorted(taste.disliked.map((a) => a.movieId))).toEqual(
      sorted(strongest(dislikedRows, 10)),
    );
  });

  it("AC-5: breaks a tie in strength by the highest movie id when the update time is the same", async () => {
    const user = await ctx.fx.newUser();
    const at = new Date();
    const ids = await fx.addMovies(Array.from({ length: 31 }, () => ({})));
    await fx.rate(
      user.id,
      ids.map((movieId) => ({ movieId, score: 8, updatedAt: at })),
    );

    const taste = await loadTaste(ctx.db, user.id);

    expect(sorted(taste.liked.map((a) => a.movieId))).toEqual(
      sorted(ids).slice(1),
    );
  });

  it("AC-5: breaks a tie in strength by the newest update", async () => {
    const user = await ctx.fx.newUser();
    const base = Date.now();
    const ids = await fx.addMovies(Array.from({ length: 31 }, () => ({})));
    // The first movie is the newest rating and the last (highest id) is the
    // oldest, so the oldest must be the one left out, not the lowest id.
    await fx.rate(
      user.id,
      ids.map((movieId, i) => ({
        movieId,
        score: 8,
        updatedAt: new Date(base - i * 60_000),
      })),
    );

    const taste = await loadTaste(ctx.db, user.id);

    expect(sorted(taste.liked.map((a) => a.movieId))).toEqual(
      sorted(ids.slice(0, 30)),
    );
  });

  it("AC-5: keeps the likes as anchors when 40 dislikes of score 1 outnumber them", async () => {
    const user = await ctx.fx.newUser();
    const dislikes = await fx.addMovies(Array.from({ length: 40 }, () => ({})));
    const likes = await fx.addMovies([{}, {}, {}]);
    await fx.rate(user.id, [
      ...dislikes.map((movieId) => ({ movieId, score: 1 })),
      ...likes.map((movieId) => ({ movieId, score: 7 })),
    ]);

    const taste = await loadTaste(ctx.db, user.id);

    expect(sorted(taste.liked.map((a) => a.movieId))).toEqual(sorted(likes));
    expect(taste.disliked).toHaveLength(10);
    expect(taste.likedCount).toBe(3);
    expect(taste.dislikedCount).toBe(40);
  });

  it("AC-7: counts nothing for a user with no ratings", async () => {
    const user = await ctx.fx.newUser();

    const taste = await loadTaste(ctx.db, user.id);

    expect(taste).toEqual({
      likedCount: 0,
      dislikedCount: 0,
      liked: [],
      disliked: [],
    });
  });

  it("AC-13: ignores a rated movie that has no embedding", async () => {
    const user = await ctx.fx.newUser();
    // A withdrawn movie, because the catalog's embed sweep never touches those.
    const [embedded, plain] = await fx.addMovies([
      {},
      { vector: null, removed: true },
    ]);
    await fx.rate(user.id, [
      { movieId: embedded, score: 9 },
      { movieId: plain, score: 9 },
    ]);

    const taste = await loadTaste(ctx.db, user.id);

    expect(taste.likedCount).toBe(1);
    expect(taste.liked.map((a) => a.movieId)).toEqual([embedded]);
  });

  it("AC-13: ignores a rated movie whose embedding is for another model", async () => {
    const user = await ctx.fx.newUser();
    const [current, other] = await fx.addMovies([
      {},
      { model: "test-other-model" },
    ]);
    await fx.rate(user.id, [
      { movieId: current, score: 9 },
      { movieId: other, score: 2 },
    ]);

    const taste = await loadTaste(ctx.db, user.id);

    // Another test file's embed sweep may have embedded the second movie for the
    // current model since it was made; then it counts, and that is correct.
    const swept = await fx.embeddedNow([other]);
    expect(taste.likedCount).toBe(1);
    expect(taste.dislikedCount).toBe(swept.length);
  });

  it("AC-5: stops counting a rated movie once the catalog deletes its embedding", async () => {
    const user = await ctx.fx.newUser();
    const [kept, withdrawn] = await fx.addMovies([{}, { removed: true }]);
    await fx.rate(user.id, [
      { movieId: kept, score: 9 },
      { movieId: withdrawn, score: 9 },
    ]);
    await ctx.db
      .delete(movieEmbeddings)
      .where(eq(movieEmbeddings.movieId, withdrawn));

    const taste = await loadTaste(ctx.db, user.id);

    expect(taste.liked.map((a) => a.movieId)).toEqual([kept]);
    expect(taste.likedCount).toBe(1);
  });

  it("AC-16: reads only the given user's ratings", async () => {
    const [alice, bob] = [await ctx.fx.newUser(), await ctx.fx.newUser()];
    const [a, b] = await fx.addMovies([{}, {}]);
    await fx.rate(alice.id, [{ movieId: a, score: 9 }]);
    await fx.rate(bob.id, [{ movieId: b, score: 2 }]);

    const aliceTaste = await loadTaste(ctx.db, alice.id);
    const bobTaste = await loadTaste(ctx.db, bob.id);

    expect(aliceTaste.liked.map((x) => x.movieId)).toEqual([a]);
    expect(aliceTaste.dislikedCount).toBe(0);
    expect(bobTaste.disliked.map((x) => x.movieId)).toEqual([b]);
    expect(bobTaste.likedCount).toBe(0);
  });
});

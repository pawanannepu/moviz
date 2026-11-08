import { and, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { movies } from "@/db/schema";
import { saveRating } from "@/ratings/save-rating";
import { saveSwipe } from "@/ratings/save-swipe";
import { TEST_DATABASE_URL, useTestDb } from "@/test-support/test-db";
import { type Surface, unavailableMovies } from "./exclusions";

describe.skipIf(!TEST_DATABASE_URL)("unavailableMovies (database)", () => {
  const t = useTestDb();

  async function visibleTo(userId: string, ids: number[], surface: Surface) {
    const rows = await t.db
      .select({ id: movies.id })
      .from(movies)
      .where(
        and(
          inArray(movies.id, ids),
          unavailableMovies(userId, movies.id, surface),
        ),
      );
    return rows.map((row) => row.id).sort((a, b) => a - b);
  }

  it.each(["deck", "feed"] as const)(
    "hides rated and skipped movies and keeps the rest on the %s (AC-5)",
    async (surface) => {
      const user = await t.fx.newUser();
      const [liked, disliked, skipped, fresh, rated] = await t.fx.newMovies(5);
      await saveSwipe(t.db, {
        userId: user.id,
        movieId: liked.id,
        choice: "liked",
      });
      await saveSwipe(t.db, {
        userId: user.id,
        movieId: disliked.id,
        choice: "disliked",
      });
      await saveSwipe(t.db, {
        userId: user.id,
        movieId: skipped.id,
        choice: "not_seen",
      });
      await saveRating(t.db, {
        userId: user.id,
        movieId: rated.id,
        score: 5,
        source: "manual",
      });

      const ids = [liked, disliked, skipped, fresh, rated].map((m) => m.id);
      expect(await visibleTo(user.id, ids, surface)).toEqual([fresh.id]);
    },
  );

  it.each(["deck", "feed"] as const)(
    "hides nothing for another user on the %s (AC-5, AC-14)",
    async (surface) => {
      const [owner, other] = [await t.fx.newUser(), await t.fx.newUser()];
      const [a, b, c] = await t.fx.newMovies(3);
      await saveSwipe(t.db, {
        userId: owner.id,
        movieId: a.id,
        choice: "liked",
      });
      await saveSwipe(t.db, {
        userId: owner.id,
        movieId: b.id,
        choice: "not_seen",
      });

      const ids = [a.id, b.id, c.id].sort((x, y) => x - y);
      expect(await visibleTo(other.id, ids, surface)).toEqual(ids);
    },
  );

  it("shows a fresh movie, hides it after a skip, and still hides it once rated", async () => {
    const user = await t.fx.newUser();
    const [movie] = await t.fx.newMovies(1);
    expect(await visibleTo(user.id, [movie.id], "deck")).toEqual([movie.id]);
    await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "not_seen",
    });
    expect(await visibleTo(user.id, [movie.id], "deck")).toEqual([]);
    await saveRating(t.db, {
      userId: user.id,
      movieId: movie.id,
      score: 8,
      source: "manual",
    });
    expect(await visibleTo(user.id, [movie.id], "deck")).toEqual([]);
  });

  it("treats an unknown user as having hidden nothing", async () => {
    const [movie] = await t.fx.newMovies(1);
    expect(await visibleTo("nobody-here", [movie.id], "feed")).toEqual([
      movie.id,
    ]);
  });
});

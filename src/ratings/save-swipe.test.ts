import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ratings, swipeSkips } from "@/db/schema";
import {
  TEST_DATABASE_URL,
  UNKNOWN_MOVIE_ID,
  UNKNOWN_USER_ID,
  useTestDb,
} from "@/test-support/test-db";
import { saveRating } from "./save-rating";
import { saveSwipe } from "./save-swipe";

describe.skipIf(!TEST_DATABASE_URL)("saveSwipe (database)", () => {
  const t = useTestDb();

  const ratingRows = (userId: string, movieId: number) =>
    t.db
      .select()
      .from(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.movieId, movieId)));
  const skipRows = (userId: string, movieId: number) =>
    t.db
      .select()
      .from(swipeSkips)
      .where(
        and(eq(swipeSkips.userId, userId), eq(swipeSkips.movieId, movieId)),
      );

  it("saves a rating of 8 with source swipe for liked (AC-4)", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    const result = await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "liked",
    });
    expect(result.ok).toBe(true);
    expect(await ratingRows(user.id, movie.id)).toMatchObject([
      { score: 8, source: "swipe" },
    ]);
  });

  it("saves a rating of 2 with source swipe for disliked (AC-4)", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "disliked",
    });
    expect(await ratingRows(user.id, movie.id)).toMatchObject([
      { score: 2, source: "swipe" },
    ]);
  });

  it("saves a skip and no rating for not seen (AC-4)", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    const result = await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "not_seen",
    });
    expect(result.ok).toBe(true);
    expect(await skipRows(user.id, movie.id)).toHaveLength(1);
    expect(await ratingRows(user.id, movie.id)).toEqual([]);
  });

  it("writes no skip when not seen is swiped on an already rated movie (AC-4)", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    await saveRating(t.db, {
      userId: user.id,
      movieId: movie.id,
      score: 9,
      source: "manual",
    });

    const result = await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "not_seen",
    });

    expect(result.ok).toBe(true);
    expect(await skipRows(user.id, movie.id)).toEqual([]);
    expect(await ratingRows(user.id, movie.id)).toMatchObject([
      { score: 9, source: "manual" },
    ]);
  });

  it("turns an earlier skip into a rating when the user later likes the movie (AC-3)", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "not_seen",
    });
    await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "liked",
    });
    expect(await skipRows(user.id, movie.id)).toEqual([]);
    expect(await ratingRows(user.id, movie.id)).toHaveLength(1);
  });

  it("lets a later swipe change the score", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "liked",
    });
    await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "disliked",
    });
    expect(await ratingRows(user.id, movie.id)).toMatchObject([{ score: 2 }]);
  });

  it("is harmless to repeat the same liked swipe four times at once (AC-4)", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        saveSwipe(t.db, {
          userId: user.id,
          movieId: movie.id,
          choice: "liked",
        }),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await ratingRows(user.id, movie.id)).toHaveLength(1);
  });

  it("is harmless to repeat the same not seen swipe four times at once (AC-4)", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        saveSwipe(t.db, {
          userId: user.id,
          movieId: movie.id,
          choice: "not_seen",
        }),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await skipRows(user.id, movie.id)).toHaveLength(1);
  });

  it("never leaves a movie both rated and skipped when a rating races two not seen swipes (AC-3, AC-4)", async () => {
    const user = await t.fx.newUser();
    const movies = await t.fx.newMovies(15);

    for (const movie of movies) {
      await Promise.all([
        saveRating(t.db, {
          userId: user.id,
          movieId: movie.id,
          score: 7,
          source: "manual",
        }),
        saveSwipe(t.db, {
          userId: user.id,
          movieId: movie.id,
          choice: "not_seen",
        }),
        saveSwipe(t.db, {
          userId: user.id,
          movieId: movie.id,
          choice: "not_seen",
        }),
      ]);
    }

    for (const movie of movies) {
      const rated = (await ratingRows(user.id, movie.id)).length;
      const skipped = (await skipRows(user.id, movie.id)).length;
      expect(rated).toBe(1);
      expect(skipped).toBe(0);
    }
  });

  it.each(["liked", "disliked", "not_seen"] as const)(
    "returns movie_not_found for an unknown movie when the choice is %s",
    async (choice) => {
      const user = await t.fx.newUser();
      const result = await saveSwipe(t.db, {
        userId: user.id,
        movieId: UNKNOWN_MOVIE_ID,
        choice,
      });
      expect(result).toEqual({ ok: false, error: { code: "movie_not_found" } });
    },
  );

  it.each(["liked", "disliked", "not_seen"] as const)(
    "returns user_not_found for an unknown user when the choice is %s",
    async (choice) => {
      const movie = await t.fx.newMovie();
      const result = await saveSwipe(t.db, {
        userId: UNKNOWN_USER_ID,
        movieId: movie.id,
        choice,
      });
      expect(result).toEqual({ ok: false, error: { code: "user_not_found" } });
    },
  );
});

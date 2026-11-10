import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ratings, swipeSkips } from "@/db/schema";
import { TEST_DATABASE_URL, useTestDb } from "@/test-support/test-db";
import { saveRating } from "./save-rating";
import { saveSwipe } from "./save-swipe";
import { undoSwipe } from "./undo-swipe";

describe.skipIf(!TEST_DATABASE_URL)("undoSwipe (database)", () => {
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

  it("deletes a liked swipe rating and reports restored (AC-5)", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "liked",
    });
    const result = await undoSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "liked",
    });
    expect(result).toEqual({ ok: true, value: { restored: true } });
    expect(await ratingRows(user.id, movie.id)).toEqual([]);
  });

  it("deletes a disliked swipe rating (AC-5)", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "disliked",
    });
    const result = await undoSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "disliked",
    });
    expect(result).toEqual({ ok: true, value: { restored: true } });
    expect(await ratingRows(user.id, movie.id)).toEqual([]);
  });

  it("deletes only the skip for not seen (AC-5)", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "not_seen",
    });
    const result = await undoSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "not_seen",
    });
    expect(result).toEqual({ ok: true, value: { restored: true } });
    expect(await skipRows(user.id, movie.id)).toEqual([]);
  });

  it("with the wrong choice deletes nothing and does not restore (AC-5)", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "liked",
    });
    const wrongKind = await undoSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "not_seen",
    });
    const wrongScore = await undoSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "disliked",
    });
    expect(wrongKind).toEqual({ ok: true, value: { restored: false } });
    expect(wrongScore).toEqual({ ok: true, value: { restored: false } });
    expect(await ratingRows(user.id, movie.id)).toHaveLength(1);
  });

  it("never deletes a manual or imported rating, even with a matching score (AC-5)", async () => {
    const user = await t.fx.newUser();
    const manual = await t.fx.newMovie();
    const imported = await t.fx.newMovie();
    await saveRating(t.db, {
      userId: user.id,
      movieId: manual.id,
      score: 8,
      source: "manual",
    });
    await saveRating(t.db, {
      userId: user.id,
      movieId: imported.id,
      score: 8,
      source: "import",
    });
    for (const movie of [manual, imported]) {
      const result = await undoSwipe(t.db, {
        userId: user.id,
        movieId: movie.id,
        choice: "liked",
      });
      expect(result).toEqual({ ok: true, value: { restored: false } });
      expect(await ratingRows(user.id, movie.id)).toHaveLength(1);
    }
  });

  it("never touches another user's rows (AC-11)", async () => {
    const mine = await t.fx.newUser();
    const theirs = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    await saveSwipe(t.db, {
      userId: theirs.id,
      movieId: movie.id,
      choice: "liked",
    });
    const result = await undoSwipe(t.db, {
      userId: mine.id,
      movieId: movie.id,
      choice: "liked",
    });
    expect(result).toEqual({ ok: true, value: { restored: false } });
    expect(await ratingRows(theirs.id, movie.id)).toHaveLength(1);
  });

  it("succeeds when there is nothing to delete (AC-5)", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    const result = await undoSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "liked",
    });
    expect(result).toEqual({ ok: true, value: { restored: false } });
  });
});

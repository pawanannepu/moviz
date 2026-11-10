import { inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { movieGenres, movies } from "@/db/schema";
import { saveRating } from "@/ratings/save-rating";
import { saveSwipe } from "@/ratings/save-swipe";
import { TEST_DATABASE_URL, useTestDb } from "@/test-support/test-db";
import { countProgress } from "./count-progress";
import { loadDeck } from "./load-deck";

/**
 * The test branch is shared and may hold a real catalog, so these movies get
 * vote counts near the integer limit. They sort ahead of anything else, and the
 * tests only look at their own movies.
 */
const TOP_VOTES = 2_000_000_000;

describe.skipIf(!TEST_DATABASE_URL)(
  "loadDeck and countProgress (database)",
  () => {
    const t = useTestDb();

    async function listableMovies(count: number) {
      const rows = await t.fx.newMovies(count);
      // Spread the votes so the vote order of these movies is known: first row first.
      for (const [index, row] of rows.entries()) {
        await t.db
          .update(movies)
          .set({
            posterPath: `/poster-${row.id}.jpg`,
            voteCount: TOP_VOTES - index,
          })
          .where(inArray(movies.id, [row.id]));
      }
      return rows;
    }

    const ids = (cards: { id: number }[]) => cards.map((card) => card.id);

    it("serves listable movies in vote order and hides withdrawn and posterless ones (AC-2)", async () => {
      const user = await t.fx.newUser();
      const [first, second, withdrawn, posterless] = await listableMovies(4);
      await t.db
        .update(movies)
        .set({ sourceMissingAt: new Date() })
        .where(inArray(movies.id, [withdrawn.id]));
      await t.db
        .update(movies)
        .set({ posterPath: null })
        .where(inArray(movies.id, [posterless.id]));

      const result = await loadDeck(t.db, { userId: user.id });
      if (!result.ok) throw new Error("loadDeck failed");
      const mine = ids(result.value.cards).filter((id) =>
        [first.id, second.id, withdrawn.id, posterless.id].includes(id),
      );
      expect(mine).toEqual([first.id, second.id]);
      expect(result.value.cards[0]).toEqual({
        id: expect.any(Number),
        title: expect.any(String),
        releaseYear: null,
        posterPath: expect.stringMatching(/^\/poster-/),
      });
    });

    it("gives every user the same order, then drops what this user dealt with (AC-2, AC-6)", async () => {
      const [a, b, c, d] = await listableMovies(4);
      const user = await t.fx.newUser();
      const other = await t.fx.newUser();
      await saveSwipe(t.db, {
        userId: user.id,
        movieId: a.id,
        choice: "liked",
      });
      await saveSwipe(t.db, {
        userId: user.id,
        movieId: b.id,
        choice: "not_seen",
      });
      await saveRating(t.db, {
        userId: user.id,
        movieId: c.id,
        score: 5,
        source: "manual",
      });

      const mine = await loadDeck(t.db, { userId: user.id });
      const theirs = await loadDeck(t.db, { userId: other.id });
      if (!mine.ok || !theirs.ok) throw new Error("loadDeck failed");
      const fixture = [a.id, b.id, c.id, d.id];
      const pick = (cards: { id: number }[]) =>
        ids(cards).filter((id) => fixture.includes(id));
      expect(pick(mine.value.cards)).toEqual([d.id]);
      expect(pick(theirs.value.cards)).toEqual([a.id, b.id, c.id, d.id]);
    });

    it("orders by genre rotation over the whole pool (AC-2)", async () => {
      const user = await t.fx.newUser();
      const [a, b, c] = await listableMovies(3);
      // a and b share a genre, c has none: c comes between them.
      await t.db.insert(movieGenres).values([
        { movieId: a.id, genreId: await anyGenre() },
        { movieId: b.id, genreId: await anyGenre() },
      ]);
      const result = await loadDeck(t.db, { userId: user.id });
      if (!result.ok) throw new Error("loadDeck failed");
      const mine = ids(result.value.cards).filter((id) =>
        [a.id, b.id, c.id].includes(id),
      );
      expect(mine[0]).toBe(a.id);
      expect(mine).toHaveLength(3);
    });

    it("counts rated across every source and shown as swipe ratings plus skips (AC-4, AC-8)", async () => {
      const user = await t.fx.newUser();
      const [a, b, c, d] = await listableMovies(4);
      await saveSwipe(t.db, {
        userId: user.id,
        movieId: a.id,
        choice: "liked",
      });
      await saveSwipe(t.db, {
        userId: user.id,
        movieId: b.id,
        choice: "disliked",
      });
      await saveSwipe(t.db, {
        userId: user.id,
        movieId: c.id,
        choice: "not_seen",
      });
      await saveRating(t.db, {
        userId: user.id,
        movieId: d.id,
        score: 9,
        source: "import",
      });

      const progress = await countProgress(t.db, { userId: user.id });
      expect(progress).toEqual({ ok: true, value: { rated: 3, shown: 3 } });
    });

    async function anyGenre(): Promise<number> {
      const { genres } = await import("@/db/schema");
      const [row] = await t.db.select({ id: genres.id }).from(genres).limit(1);
      if (row) return row.id;
      const [created] = await t.db
        .insert(genres)
        .values({ name: `Test Genre ${Math.random()}` })
        .returning({ id: genres.id });
      return created.id;
    }
  },
);

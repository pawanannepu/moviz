import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { feedFeedback } from "@/db/schema";
import { TEST_DATABASE_URL, useTestDb } from "@/test-support/test-db";
import {
  clearFeedback,
  feedbackFor,
  MORE_LIKE_THIS_IDS_LIMIT,
  moreLikeThisIds,
  setFeedback,
} from "./feedback";

/** A movie id of the right shape that no catalog holds. */
const UNKNOWN_MOVIE = 999_999_999_999;

describe.skipIf(!TEST_DATABASE_URL)(
  "feedback data functions (database)",
  () => {
    const t = useTestDb();

    const rowsOf = (userId: string) =>
      t.db.select().from(feedFeedback).where(eq(feedFeedback.userId, userId));

    /** Sets a row's `created_at` to a fixed past time, so a reset is easy to see. */
    const backdate = (userId: string, movieId: number) =>
      t.db
        .update(feedFeedback)
        .set({ createdAt: new Date("2020-01-01T00:00:00.000Z") })
        .where(
          and(
            eq(feedFeedback.userId, userId),
            eq(feedFeedback.movieId, movieId),
          ),
        );

    describe("setFeedback (AC-13)", () => {
      it("saves one row with the kind", async () => {
        const user = await t.fx.newUser();
        const [movie] = await t.fx.newMovies(1);

        const result = await setFeedback(t.db, {
          userId: user.id,
          movieId: movie.id,
          kind: "not_interested",
        });

        expect(result).toEqual({ ok: true, value: undefined });
        const rows = await rowsOf(user.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          movieId: movie.id,
          kind: "not_interested",
        });
      });

      it("keeps the row and its created_at when the same kind is set again", async () => {
        const user = await t.fx.newUser();
        const [movie] = await t.fx.newMovies(1);
        const input = {
          userId: user.id,
          movieId: movie.id,
          kind: "more_like_this" as const,
        };
        await setFeedback(t.db, input);
        await backdate(user.id, movie.id);

        await setFeedback(t.db, input);

        const rows = await rowsOf(user.id);
        expect(rows).toHaveLength(1);
        expect(rows[0].createdAt.toISOString()).toBe(
          "2020-01-01T00:00:00.000Z",
        );
      });

      it("replaces the kind and resets created_at when the other kind is set", async () => {
        const user = await t.fx.newUser();
        const [movie] = await t.fx.newMovies(1);
        await setFeedback(t.db, {
          userId: user.id,
          movieId: movie.id,
          kind: "more_like_this",
        });
        await backdate(user.id, movie.id);

        await setFeedback(t.db, {
          userId: user.id,
          movieId: movie.id,
          kind: "not_interested",
        });

        const rows = await rowsOf(user.id);
        expect(rows).toHaveLength(1);
        expect(rows[0].kind).toBe("not_interested");
        expect(rows[0].createdAt.getTime()).toBeGreaterThan(
          new Date("2020-01-02").getTime(),
        );
      });

      it("returns movie_not_found for an unknown movie and writes nothing", async () => {
        const user = await t.fx.newUser();

        const result = await setFeedback(t.db, {
          userId: user.id,
          movieId: UNKNOWN_MOVIE,
          kind: "not_interested",
        });

        expect(result).toEqual({
          ok: false,
          error: { code: "movie_not_found" },
        });
        expect(await rowsOf(user.id)).toEqual([]);
      });

      it("keeps one user's row apart from another's on the same movie", async () => {
        const [alice, bob] = [await t.fx.newUser(), await t.fx.newUser()];
        const [movie] = await t.fx.newMovies(1);

        await setFeedback(t.db, {
          userId: alice.id,
          movieId: movie.id,
          kind: "not_interested",
        });
        await setFeedback(t.db, {
          userId: bob.id,
          movieId: movie.id,
          kind: "more_like_this",
        });

        expect((await rowsOf(alice.id)).map((r) => r.kind)).toEqual([
          "not_interested",
        ]);
        expect((await rowsOf(bob.id)).map((r) => r.kind)).toEqual([
          "more_like_this",
        ]);
      });
    });

    describe("clearFeedback (AC-13)", () => {
      it("removes the row", async () => {
        const user = await t.fx.newUser();
        const [movie] = await t.fx.newMovies(1);
        await setFeedback(t.db, {
          userId: user.id,
          movieId: movie.id,
          kind: "not_interested",
        });

        const result = await clearFeedback(t.db, {
          userId: user.id,
          movieId: movie.id,
        });

        expect(result).toEqual({ ok: true, value: undefined });
        expect(await rowsOf(user.id)).toEqual([]);
      });

      it("succeeds when there is no row to remove", async () => {
        const user = await t.fx.newUser();

        expect(
          await clearFeedback(t.db, {
            userId: user.id,
            movieId: UNKNOWN_MOVIE,
          }),
        ).toEqual({ ok: true, value: undefined });
      });

      it("leaves another user's row alone", async () => {
        const [alice, bob] = [await t.fx.newUser(), await t.fx.newUser()];
        const [movie] = await t.fx.newMovies(1);
        await setFeedback(t.db, {
          userId: bob.id,
          movieId: movie.id,
          kind: "not_interested",
        });

        await clearFeedback(t.db, { userId: alice.id, movieId: movie.id });

        expect(await rowsOf(bob.id)).toHaveLength(1);
      });
    });

    describe("feedbackFor", () => {
      it("returns the saved kind, or null when there is none", async () => {
        const user = await t.fx.newUser();
        const [hidden, untouched] = await t.fx.newMovies(2);
        await setFeedback(t.db, {
          userId: user.id,
          movieId: hidden.id,
          kind: "not_interested",
        });

        expect(
          await feedbackFor(t.db, { userId: user.id, movieId: hidden.id }),
        ).toEqual({
          ok: true,
          value: "not_interested",
        });
        expect(
          await feedbackFor(t.db, { userId: user.id, movieId: untouched.id }),
        ).toEqual({ ok: true, value: null });
      });

      it("never reads another user's row", async () => {
        const [alice, bob] = [await t.fx.newUser(), await t.fx.newUser()];
        const [movie] = await t.fx.newMovies(1);
        await setFeedback(t.db, {
          userId: bob.id,
          movieId: movie.id,
          kind: "more_like_this",
        });

        expect(
          await feedbackFor(t.db, { userId: alice.id, movieId: movie.id }),
        ).toEqual({
          ok: true,
          value: null,
        });
      });
    });

    describe("moreLikeThisIds (AC-5)", () => {
      it("returns only the movies marked more_like_this among the ids asked for", async () => {
        const user = await t.fx.newUser();
        const [asked, hidden, plain, other] = await t.fx.newMovies(4);
        await setFeedback(t.db, {
          userId: user.id,
          movieId: asked.id,
          kind: "more_like_this",
        });
        await setFeedback(t.db, {
          userId: user.id,
          movieId: hidden.id,
          kind: "not_interested",
        });
        await setFeedback(t.db, {
          userId: user.id,
          movieId: other.id,
          kind: "more_like_this",
        });

        const result = await moreLikeThisIds(t.db, {
          userId: user.id,
          movieIds: [asked.id, hidden.id, plain.id],
        });

        expect(result).toEqual({ ok: true, value: new Set([asked.id]) });
      });

      it("returns an empty set for an empty list", async () => {
        const user = await t.fx.newUser();

        expect(
          await moreLikeThisIds(t.db, { userId: user.id, movieIds: [] }),
        ).toEqual({
          ok: true,
          value: new Set(),
        });
      });

      it("refuses more ids than one batch holds", async () => {
        const user = await t.fx.newUser();
        const ids = Array.from(
          { length: MORE_LIKE_THIS_IDS_LIMIT + 1 },
          (_, i) => i + 1,
        );

        await expect(
          moreLikeThisIds(t.db, { userId: user.id, movieIds: ids }),
        ).rejects.toThrow(`at most ${MORE_LIKE_THIS_IDS_LIMIT} ids`);
      });
    });
  },
);

describe("feedback data functions (no database)", () => {
  it("makes no query for an empty id list", async () => {
    const forbidden = new Proxy(
      {},
      {
        get() {
          throw new Error("no query expected");
        },
      },
    );

    const result = await moreLikeThisIds(forbidden as never, {
      userId: "user-1",
      movieIds: [],
    });

    expect(result).toEqual({ ok: true, value: new Set() });
  });

  it("returns db_unavailable when the database cannot be reached, and a clean error for a bug", async () => {
    const unreachable = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () =>
            Promise.reject(
              Object.assign(new Error("x"), { code: "ECONNREFUSED" }),
            ),
        }),
      }),
      delete: () => ({
        where: () =>
          Promise.reject(
            Object.assign(new Error("secret movie 424242 user-9"), {
              code: "42601",
            }),
          ),
      }),
    };

    expect(
      await setFeedback(unreachable as never, {
        userId: "user-9",
        movieId: 424242,
        kind: "not_interested",
      }),
    ).toEqual({ ok: false, error: { code: "db_unavailable" } });

    const failure = clearFeedback(unreachable as never, {
      userId: "user-9",
      movieId: 424242,
    });
    await expect(failure).rejects.toThrow(
      "clearFeedback failed: Error (code 42601)",
    );
    await expect(failure).rejects.not.toThrow(/424242|user-9/);
  });
});

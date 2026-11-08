import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ratings } from "@/db/schema";
import {
  forbiddenDb,
  TEST_DATABASE_URL,
  useTestDb,
} from "@/test-support/test-db";
import { listRatings, type RatingsPage } from "./list-ratings";
import { saveRating } from "./save-rating";

describe("listRatings cursor check", () => {
  it("returns invalid_cursor for a garbage cursor without touching the database (AC-16)", async () => {
    const result = await listRatings(forbiddenDb, {
      userId: "u",
      cursor: "garbage",
    });
    expect(result).toEqual({ ok: false, error: { code: "invalid_cursor" } });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("listRatings (database)", () => {
  const t = useTestDb();

  /** Reads every page until `nextCursor` is null and returns the pages. */
  async function readAllPages(userId: string, limit: number) {
    const pages: RatingsPage[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 500; guard++) {
      const result = await listRatings(t.db, { userId, cursor, limit });
      if (!result.ok)
        throw new Error(`listRatings failed with ${result.error.code}`);
      pages.push(result.value);
      if (result.value.nextCursor === null) return pages;
      cursor = result.value.nextCursor;
    }
    throw new Error("paging never ended");
  }

  it("returns the newest change first", async () => {
    const user = await t.fx.newUser();
    const [first, second, third] = await t.fx.newMovies(3);
    for (const movie of [first, second, third]) {
      await saveRating(t.db, {
        userId: user.id,
        movieId: movie.id,
        score: 5,
        source: "manual",
      });
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    // Changing the first one moves it to the top.
    await saveRating(t.db, {
      userId: user.id,
      movieId: first.id,
      score: 6,
      source: "manual",
    });

    const result = await listRatings(t.db, { userId: user.id });
    expect(result.ok && result.value.items.map((r) => r.movieId)).toEqual([
      first.id,
      third.id,
      second.id,
    ]);
  });

  it("returns only the caller's ratings, even with another user's cursor (AC-14)", async () => {
    const [a, b] = [await t.fx.newUser(), await t.fx.newUser()];
    const movies = await t.fx.newMovies(4);
    for (const movie of movies) {
      await saveRating(t.db, {
        userId: a.id,
        movieId: movie.id,
        score: 5,
        source: "manual",
      });
    }
    await saveRating(t.db, {
      userId: b.id,
      movieId: movies[0].id,
      score: 5,
      source: "manual",
    });

    const pageOfA = await listRatings(t.db, { userId: a.id, limit: 2 });
    const cursor = pageOfA.ok
      ? (pageOfA.value.nextCursor ?? undefined)
      : undefined;
    const asB = await listRatings(t.db, { userId: b.id, cursor });

    expect(asB.ok && asB.value.items.every((r) => r.userId === b.id)).toBe(
      true,
    );
    expect(
      pageOfA.ok && pageOfA.value.items.every((r) => r.userId === a.id),
    ).toBe(true);
  });

  it("returns an empty page and no cursor for a user with no ratings", async () => {
    const user = await t.fx.newUser();
    const result = await listRatings(t.db, { userId: user.id });
    expect(result).toEqual({
      ok: true,
      value: { items: [], nextCursor: null },
    });
  });

  it("pages through 7 rows that share one updated_at, seeing each once (AC-16)", async () => {
    const user = await t.fx.newUser();
    const movies = await t.fx.newMovies(7);
    const sameInstant = new Date("2026-01-01T00:00:00.000Z");
    await t.db.insert(ratings).values(
      movies.map((movie) => ({
        userId: user.id,
        movieId: movie.id,
        score: 5,
        source: "manual" as const,
        updatedAt: sameInstant,
      })),
    );

    const pages = await readAllPages(user.id, 3);
    const seen = pages.flatMap((page) => page.items.map((r) => r.movieId));

    expect(pages.map((p) => p.items.length)).toEqual([3, 3, 1]);
    expect([...seen].sort()).toEqual(movies.map((m) => m.id).sort());
    expect(new Set(seen).size).toBe(7);
    expect(seen).toEqual([...seen].sort((x, y) => y - x));
  });

  it("pages correctly over rows that differ only in microseconds (AC-16)", async () => {
    const user = await t.fx.newUser();
    const movies = await t.fx.newMovies(3);
    for (const [index, movie] of movies.entries()) {
      await t.db.execute(sql`
        insert into ratings (user_id, movie_id, score, source, updated_at)
        values (${user.id}, ${movie.id}, 5, 'manual', ${`2026-01-01 00:00:00.12345${index + 1}+00`}::timestamptz)
      `);
    }

    const pages = await readAllPages(user.id, 1);
    const seen = pages.flatMap((page) => page.items.map((r) => r.movieId));

    expect(seen).toEqual([movies[2].id, movies[1].id, movies[0].id]);
  });

  it("returns a null cursor when the last page is exactly full", async () => {
    const user = await t.fx.newUser();
    for (const movie of await t.fx.newMovies(6)) {
      await saveRating(t.db, {
        userId: user.id,
        movieId: movie.id,
        score: 5,
        source: "manual",
      });
    }
    const pages = await readAllPages(user.id, 3);
    expect(pages.map((p) => p.items.length)).toEqual([3, 3]);
    expect(pages[1].nextCursor).toBeNull();
  });

  it("does not repeat a row from page one when a new rating arrives between pages", async () => {
    const user = await t.fx.newUser();
    const movies = await t.fx.newMovies(5);
    for (const movie of movies) {
      await saveRating(t.db, {
        userId: user.id,
        movieId: movie.id,
        score: 5,
        source: "manual",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const pageOne = await listRatings(t.db, { userId: user.id, limit: 2 });
    if (!pageOne.ok) throw new Error("page one failed");

    const [late] = await t.fx.newMovies(1);
    await saveRating(t.db, {
      userId: user.id,
      movieId: late.id,
      score: 5,
      source: "manual",
    });

    const rest: number[] = [];
    let cursor = pageOne.value.nextCursor ?? undefined;
    while (cursor) {
      const next = await listRatings(t.db, {
        userId: user.id,
        cursor,
        limit: 2,
      });
      if (!next.ok) throw new Error("next page failed");
      rest.push(...next.value.items.map((r) => r.movieId));
      cursor = next.value.nextCursor ?? undefined;
    }

    const firstPageIds = pageOne.value.items.map((r) => r.movieId);
    expect(rest.filter((id) => firstPageIds.includes(id))).toEqual([]);
    expect(rest).toHaveLength(3);
  });

  it("applies the default page size of 50 and the cap of 100 (AC-16)", async () => {
    const user = await t.fx.newUser();
    const movies = await t.fx.newMovies(120);
    await t.db.insert(ratings).values(
      movies.map((movie) => ({
        userId: user.id,
        movieId: movie.id,
        score: 5,
        source: "import" as const,
      })),
    );

    const byDefault = await listRatings(t.db, { userId: user.id });
    const huge = await listRatings(t.db, { userId: user.id, limit: 5000 });
    const zero = await listRatings(t.db, { userId: user.id, limit: 0 });

    expect(byDefault.ok && byDefault.value.items).toHaveLength(50);
    expect(byDefault.ok && byDefault.value.nextCursor).not.toBeNull();
    expect(huge.ok && huge.value.items).toHaveLength(100);
    expect(zero.ok && zero.value.items).toHaveLength(1);
  });

  it("does not leak the helper text column into the returned rows", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    await saveRating(t.db, {
      userId: user.id,
      movieId: movie.id,
      score: 5,
      source: "manual",
    });
    const result = await listRatings(t.db, { userId: user.id });
    expect(result.ok && Object.keys(result.value.items[0]).sort()).toEqual(
      ["movieId", "ratedAt", "score", "source", "updatedAt", "userId"].sort(),
    );
  });
});

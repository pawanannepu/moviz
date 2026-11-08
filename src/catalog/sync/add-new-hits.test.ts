import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createTmdbClient } from "@/catalog/tmdb/client";
import { movieExternalIds, movies } from "@/db/schema";
import {
  daysAgo,
  details,
  fakeTmdb,
  personIdsOf,
  removeCatalogRows,
} from "@/test-support/catalog-fixtures";
import { TEST_DATABASE_URL, token, useTestDb } from "@/test-support/test-db";
import { addNewHits, daysBefore, NEW_HIT_LIMIT } from "./add-new-hits";
import { mapDetails } from "./map-details";
import { markMovieRemoved } from "./mark-removed";
import { persistMovie } from "./persist-movie";
import { emptyRunSummary } from "./run-summary";

describe("daysBefore", () => {
  it("counts back whole days in UTC", () => {
    expect(daysBefore("2026-11-08", 365)).toBe("2025-11-08");
    expect(daysBefore("2026-03-01", 1)).toBe("2026-02-28");
  });

  it("crosses a leap day", () => {
    expect(daysBefore("2024-03-01", 1)).toBe("2024-02-29");
  });

  it("returns the same day for zero days", () => {
    expect(daysBefore("2026-11-08", 0)).toBe("2026-11-08");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("addNewHits (AC-10, AC-12)", () => {
  const ctx = useTestDb();
  const tmdbIds: number[] = [];
  const personIds: number[] = [];
  const today = new Date().toISOString().slice(0, 10);

  const recent = (tag: string, overrides: Parameters<typeof details>[1] = {}) =>
    details(tag, { release_date: daysAgo(30), ...overrides });

  function world(
    entries: ReturnType<typeof details>[],
    extra: Partial<Parameters<typeof fakeTmdb>[0]> = {},
    hitPages: number[][] = [entries.map((m) => m.id)],
    deadline?: { deadline: number; now: () => number },
  ) {
    for (const movie of entries) {
      tmdbIds.push(movie.id);
      personIds.push(...personIdsOf(movie));
    }
    const fake = fakeTmdb({
      movies: new Map(entries.map((m) => [m.id, m])),
      hitPages,
      ...extra,
    });
    const tmdb = createTmdbClient({
      token: "test-token",
      fetch: fake.fetch,
      sleep: async () => undefined,
      random: () => 0,
    });
    return {
      fake,
      deps: { db: ctx.db, tmdb, today, ...deadline },
    };
  }

  const stored = async (tmdbId: number) =>
    (
      await ctx.db
        .select({ movie: movies })
        .from(movieExternalIds)
        .innerJoin(movies, eq(movies.id, movieExternalIds.movieId))
        .where(eq(movieExternalIds.externalId, String(tmdbId)))
    )[0]?.movie;

  afterAll(async () => {
    await removeCatalogRows(ctx.db, tmdbIds, personIds);
  });

  it("adds new eligible hits that are not stored yet", async () => {
    const tag = token();
    const entries = [1, 2].map((n) => recent(`${tag} ${n}`));
    const { deps } = world(entries);

    const result = await addNewHits(deps, emptyRunSummary());

    expect(result.ok && result.value.stored).toBe(2);
    for (const movie of entries) {
      expect(await stored(movie.id)).toBeDefined();
    }
  });

  it("adds at most the limit (20 by default)", async () => {
    expect(NEW_HIT_LIMIT).toBe(20);
    const tag = token();
    const entries = [1, 2, 3, 4, 5].map((n) => recent(`${tag} ${n}`));
    const { deps } = world(entries);

    const result = await addNewHits(deps, emptyRunSummary(), 3);

    expect(result.ok && result.value.stored).toBe(3);
    expect(await stored(entries[3].id)).toBeUndefined();
  });

  it("skips a movie already stored without a detail call, so a refresh is not repeated here", async () => {
    const live = recent(token());
    tmdbIds.push(live.id);
    personIds.push(...personIdsOf(live));
    await persistMovie(ctx.db, mapDetails(live));
    const fresh = recent(token());
    const { fake, deps } = world([live, fresh]);

    const result = await addNewHits(deps, emptyRunSummary());

    expect(result.ok && result.value.stored).toBe(1);
    expect(fake.calls.filter((p) => p === `/movie/${live.id}`)).toHaveLength(0);
  });

  it("never adds back a movie that was removed (AC-12)", async () => {
    const gone = recent(token());
    tmdbIds.push(gone.id);
    personIds.push(...personIdsOf(gone));
    await persistMovie(ctx.db, mapDetails(gone));
    await markMovieRemoved(ctx.db, gone.id);
    const { fake, deps } = world([gone]);

    const result = await addNewHits(deps, emptyRunSummary());

    expect(result.ok && result.value.stored).toBe(0);
    expect(fake.calls.filter((p) => p === `/movie/${gone.id}`)).toHaveLength(0);
    const saved = await stored(gone.id);
    expect(saved?.sourceMissingAt).not.toBeNull();
    const ext = await ctx.db
      .select()
      .from(movieExternalIds)
      .where(
        and(
          eq(movieExternalIds.provider, "tmdb"),
          eq(movieExternalIds.externalId, String(gone.id)),
        ),
      );
    expect(ext).toHaveLength(1);
  });

  it("counts an ineligible hit under its reason and does not store it", async () => {
    const weak = recent(token(), { vote_count: 10 });
    const { deps } = world([weak]);

    const result = await addNewHits(deps, emptyRunSummary());

    expect(result.ok && result.value.skipped.low_votes).toBe(1);
    expect(await stored(weak.id)).toBeUndefined();
  });

  it("asks discover for the most popular movies of the last 365 days with at least 500 votes", async () => {
    const { fake, deps } = world([recent(token())]);

    await addNewHits(deps, emptyRunSummary());

    const discover = fake.urls.filter(
      (u) => u.pathname === "/3/discover/movie",
    );
    expect(discover.length).toBeGreaterThan(0);
    const params = discover[0].searchParams;
    expect(params.get("sort_by")).toBe("popularity.desc");
    expect(params.get("vote_count.gte")).toBe("500");
    expect(params.get("primary_release_date.gte")).toBe(daysBefore(today, 365));
    expect(params.get("primary_release_date.lte")).toBe(today);
    expect(params.get("include_adult")).toBe("false");
  });

  it("reads at most three discover pages", async () => {
    const { fake, deps } = world([], {}, [[1], [2], [3], [4], [5]]);

    await addNewHits(deps, emptyRunSummary());

    expect(
      fake.calls.filter((path) => path === "/discover/movie").length,
    ).toBeLessThanOrEqual(3);
  });

  it("stops with tmdb_unauthorized on a bad token (AC-15)", async () => {
    const { deps } = world([recent(token())], { allStatus: 401 });

    const result = await addNewHits(deps, emptyRunSummary());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("tmdb_unauthorized");
  });

  it("counts a movie TMDB keeps failing on and carries on (AC-15)", async () => {
    const bad = recent(token());
    const good = recent(token());
    const { deps } = world([bad, good], {
      statusFor: new Map([[bad.id, 500]]),
    });

    const result = await addNewHits(deps, emptyRunSummary());

    expect(result.ok && result.value).toMatchObject({ stored: 1, failed: 1 });
  });

  it("starts no work once the deadline has passed (AC-10)", async () => {
    const { fake, deps } = world([recent(token())], {}, undefined, {
      deadline: 1000,
      now: () => 2000,
    });

    const result = await addNewHits(deps, emptyRunSummary());

    expect(result).toEqual({ ok: true, value: emptyRunSummary() });
    expect(fake.calls).toEqual([]);
  });
});

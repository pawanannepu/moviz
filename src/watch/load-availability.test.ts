import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import fixture from "@/catalog/tmdb/__fixtures__/watch-providers-949.json";
import type { TmdbClient } from "@/catalog/tmdb/client";
import { tmdbWatchProvidersSchema } from "@/catalog/tmdb/schemas";
import type { Db } from "@/db/create-db";
import {
  movieExternalIds,
  type StoredWatchRegion,
  watchAvailability,
} from "@/db/schema";
import { err, ok } from "@/lib/result";
import { newTmdbId } from "@/test-support/catalog-fixtures";
import {
  TEST_DATABASE_URL,
  UNKNOWN_MOVIE_ID,
  useTestDb,
} from "@/test-support/test-db";
import { HOUR_MS, WATCH_FETCH_TIMEOUT_MS } from "./constants";
import { loadAvailability } from "./load-availability";

// Spec 0013, AC-7 to AC-9: the cached read, the one TMDB try, the 404 row, the
// stale row on failure, and the movie with no TMDB id. TMDB is a fake; the
// database is the Neon test branch.

const NOW = new Date("2026-11-12T12:00:00.000Z");
const hoursBefore = (hours: number) =>
  new Date(NOW.getTime() - hours * HOUR_MS);

const body = tmdbWatchProvidersSchema.parse(fixture);

type WatchProviders = TmdbClient["getWatchProviders"];

function fakeTmdb(answer: Awaited<ReturnType<WatchProviders>>) {
  const getWatchProviders = vi.fn<WatchProviders>(async () => answer);
  return { getWatchProviders };
}

const CACHED_US: StoredWatchRegion = {
  link: "https://cached.example.test",
  offers: [
    {
      type: "flatrate",
      providerId: 1,
      name: "Cached Stream",
      logoPath: null,
      priority: 1,
    },
  ],
};

/** A database that fails every query, as if Postgres were down. */
const brokenDb = new Proxy(
  {},
  {
    get() {
      return () => {
        throw new Error("connection refused");
      };
    },
  },
) as unknown as Db;

describe("loadAvailability without a database", () => {
  it("returns unavailable when the read fails, and never calls TMDB (AC-8)", async () => {
    const tmdb = fakeTmdb(ok(body));

    const result = await loadAvailability(
      { db: brokenDb, tmdb },
      { movieId: 1, country: "US", now: NOW },
    );

    expect(result).toEqual({ ok: false, error: { code: "unavailable" } });
    expect(tmdb.getWatchProviders).not.toHaveBeenCalled();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("loadAvailability (database)", () => {
  const t = useTestDb();

  async function movieWithTmdbId() {
    const movie = await t.fx.newMovie();
    const tmdbId = newTmdbId();
    await t.db.insert(movieExternalIds).values({
      provider: "tmdb",
      externalId: String(tmdbId),
      movieId: movie.id,
    });
    return { movieId: movie.id, tmdbId };
  }

  async function seedRow(
    movieId: number,
    regions: Record<string, unknown>,
    fetchedAt: Date,
  ) {
    await t.db.insert(watchAvailability).values({
      movieId,
      regions: regions as Record<string, StoredWatchRegion>,
      fetchedAt,
    });
  }

  async function rowOf(movieId: number) {
    const [row] = await t.db
      .select()
      .from(watchAvailability)
      .where(eq(watchAvailability.movieId, movieId));
    return row;
  }

  it("uses a row younger than 24 hours with no TMDB call (AC-7)", async () => {
    const { movieId } = await movieWithTmdbId();
    await seedRow(movieId, { US: CACHED_US }, hoursBefore(23));
    const tmdb = fakeTmdb(ok(body));

    const result = await loadAvailability(
      { db: t.db, tmdb },
      { movieId, country: "US", now: NOW },
    );

    expect(result).toEqual({
      ok: true,
      value: { region: CACHED_US, fetchedAt: hoursBefore(23) },
    });
    expect(tmdb.getWatchProviders).not.toHaveBeenCalled();
  });

  it("returns a null region for a fresh row without the asked country (AC-3, AC-7)", async () => {
    const { movieId } = await movieWithTmdbId();
    await seedRow(movieId, { US: CACHED_US }, hoursBefore(1));
    const tmdb = fakeTmdb(ok(body));

    const result = await loadAvailability(
      { db: t.db, tmdb },
      { movieId, country: "DE", now: NOW },
    );

    expect(result.ok && result.value.region).toBeNull();
    expect(tmdb.getWatchProviders).not.toHaveBeenCalled();
  });

  it("asks TMDB once with one 4 second try when the row is 25 hours old, and replaces it (AC-7)", async () => {
    const { movieId, tmdbId } = await movieWithTmdbId();
    await seedRow(movieId, { US: CACHED_US }, hoursBefore(25));
    const tmdb = fakeTmdb(ok(body));

    const result = await loadAvailability(
      { db: t.db, tmdb },
      { movieId, country: "US", now: NOW },
    );

    expect(tmdb.getWatchProviders).toHaveBeenCalledTimes(1);
    expect(tmdb.getWatchProviders).toHaveBeenCalledWith(tmdbId, {
      timeoutMs: WATCH_FETCH_TIMEOUT_MS,
      maxAttempts: 1,
    });
    expect(result.ok && result.value.fetchedAt).toEqual(NOW);
    expect(result.ok && result.value.region?.link).toBe(
      "https://www.themoviedb.org/movie/949-heat/watch?locale=US",
    );
    const row = await rowOf(movieId);
    expect(row.fetchedAt).toEqual(NOW);
    expect(Object.keys(row.regions).sort()).toEqual(["FR", "GB", "US"]);
  });

  it("fetches and writes every country when there is no row yet (AC-7)", async () => {
    const { movieId } = await movieWithTmdbId();
    const tmdb = fakeTmdb(ok(body));

    const result = await loadAvailability(
      { db: t.db, tmdb },
      { movieId, country: "FR", now: NOW },
    );

    expect(result.ok && result.value.region?.offers[0].name).toBe("Canal+");
    expect(Object.keys((await rowOf(movieId)).regions).sort()).toEqual([
      "FR",
      "GB",
      "US",
    ]);
  });

  it("writes an empty row on a TMDB 404 and uses it the next day (AC-7)", async () => {
    const { movieId } = await movieWithTmdbId();
    const missing = fakeTmdb(err({ code: "tmdb_not_found" }));

    const first = await loadAvailability(
      { db: t.db, tmdb: missing },
      { movieId, country: "US", now: NOW },
    );
    const later = await loadAvailability(
      { db: t.db, tmdb: missing },
      { movieId, country: "US", now: new Date(NOW.getTime() + 12 * HOUR_MS) },
    );

    expect(first).toEqual({
      ok: true,
      value: { region: null, fetchedAt: NOW },
    });
    expect(later.ok && later.value.region).toBeNull();
    expect(missing.getWatchProviders).toHaveBeenCalledTimes(1);
    expect((await rowOf(movieId)).regions).toEqual({});
  });

  it("shows a 3 day old row with no warning when TMDB fails (AC-8)", async () => {
    const { movieId } = await movieWithTmdbId();
    await seedRow(movieId, { US: CACHED_US }, hoursBefore(72));
    const failing = fakeTmdb(err({ code: "tmdb_unavailable", status: 503 }));

    const result = await loadAvailability(
      { db: t.db, tmdb: failing },
      { movieId, country: "US", now: NOW },
    );

    expect(result).toEqual({
      ok: true,
      value: { region: CACHED_US, fetchedAt: hoursBefore(72) },
    });
    expect((await rowOf(movieId)).fetchedAt).toEqual(hoursBefore(72));
  });

  it("returns unavailable when TMDB fails and the row is 9 days old (AC-8)", async () => {
    const { movieId } = await movieWithTmdbId();
    await seedRow(movieId, { US: CACHED_US }, hoursBefore(9 * 24));
    const failing = fakeTmdb(err({ code: "tmdb_unavailable", status: null }));

    const result = await loadAvailability(
      { db: t.db, tmdb: failing },
      { movieId, country: "US", now: NOW },
    );

    expect(result).toEqual({ ok: false, error: { code: "unavailable" } });
  });

  it.each([
    ["a timeout", err({ code: "tmdb_unavailable" as const, status: null })],
    ["a wrong shape", err({ code: "tmdb_bad_shape" as const })],
    ["a bad token", err({ code: "tmdb_unauthorized" as const })],
  ])(
    "returns unavailable with no row and %s, and writes nothing (AC-8)",
    async (_label, answer) => {
      const { movieId } = await movieWithTmdbId();

      const result = await loadAvailability(
        { db: t.db, tmdb: fakeTmdb(answer) },
        { movieId, country: "US", now: NOW },
      );

      expect(result).toEqual({ ok: false, error: { code: "unavailable" } });
      expect(await rowOf(movieId)).toBeUndefined();
    },
  );

  it("returns unavailable, not a throw, when the TMDB client itself throws (AC-8)", async () => {
    const { movieId } = await movieWithTmdbId();
    const throwing = {
      getWatchProviders: vi.fn<WatchProviders>(async () => {
        throw new Error("socket hang up");
      }),
    };

    const result = await loadAvailability(
      { db: t.db, tmdb: throwing },
      { movieId, country: "US", now: NOW },
    );

    expect(result).toEqual({ ok: false, error: { code: "unavailable" } });
  });

  it("shows a stale row when there is no token, and unavailable with no row (AC-8)", async () => {
    const stale = await movieWithTmdbId();
    await seedRow(stale.movieId, { US: CACHED_US }, hoursBefore(48));
    const none = await movieWithTmdbId();

    const staleResult = await loadAvailability(
      { db: t.db },
      { movieId: stale.movieId, country: "US", now: NOW },
    );
    const noneResult = await loadAvailability(
      { db: t.db },
      { movieId: none.movieId, country: "US", now: NOW },
    );

    expect(staleResult.ok && staleResult.value.region).toEqual(CACHED_US);
    expect(noneResult).toEqual({ ok: false, error: { code: "unavailable" } });
  });

  it("refetches a fresh row whose stored country is broken, and never shows it (AC-7)", async () => {
    const { movieId } = await movieWithTmdbId();
    await seedRow(movieId, { US: { link: 5, offers: "no" } }, hoursBefore(1));
    const tmdb = fakeTmdb(ok(body));

    const result = await loadAvailability(
      { db: t.db, tmdb },
      { movieId, country: "US", now: NOW },
    );

    expect(tmdb.getWatchProviders).toHaveBeenCalledTimes(1);
    expect(result.ok && result.value.region?.offers.length).toBeGreaterThan(0);
  });

  it("returns no offers for a movie with no TMDB id, with no call and no row (AC-9)", async () => {
    const movie = await t.fx.newMovie();
    const tmdb = fakeTmdb(ok(body));

    const result = await loadAvailability(
      { db: t.db, tmdb },
      { movieId: movie.id, country: "US", now: NOW },
    );

    expect(result).toEqual({
      ok: true,
      value: { region: null, fetchedAt: NOW },
    });
    expect(tmdb.getWatchProviders).not.toHaveBeenCalled();
    expect(await rowOf(movie.id)).toBeUndefined();
  });

  it("returns no offers for a movie that does not exist, with no call", async () => {
    const tmdb = fakeTmdb(ok(body));

    const result = await loadAvailability(
      { db: t.db, tmdb },
      { movieId: UNKNOWN_MOVIE_ID, country: "US", now: NOW },
    );

    expect(result.ok && result.value.region).toBeNull();
    expect(tmdb.getWatchProviders).not.toHaveBeenCalled();
  });

  it("removes the row with its movie (AC-11)", async () => {
    const { movieId } = await movieWithTmdbId();
    await seedRow(movieId, { US: CACHED_US }, hoursBefore(1));

    await t.db.execute(`delete from movies where id = ${Number(movieId)}`);

    expect(await rowOf(movieId)).toBeUndefined();
  });
});

import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSIONS } from "@/catalog/embedding/model";
import { mapDetails } from "@/catalog/sync/map-details";
import { persistMovie } from "@/catalog/sync/persist-movie";
import {
  runCatalogSync,
  STALE_WARNING_DAYS,
  TIME_BUDGET_MS,
} from "@/catalog/sync/run-catalog-sync";
import { runSummarySchema } from "@/catalog/sync/run-summary";
import { createTmdbClient } from "@/catalog/tmdb/client";
import type { Db } from "@/db/create-db";
import { movieEmbeddings, movieExternalIds, movies } from "@/db/schema";
import {
  daysAgo,
  details,
  type FakeTmdbOptions,
  fakeTmdb,
  fakeVoyage,
  personIdsOf,
  removeCatalogRows,
} from "@/test-support/catalog-fixtures";
import {
  forbiddenDb,
  TEST_DATABASE_URL,
  token,
  useTestDb,
} from "@/test-support/test-db";
import { handleCatalogCron } from "./handle-cron";

const SECRET = "cron-secret-for-tests";
const TMDB_TOKEN = "tmdb-token-for-tests";
const VOYAGE_KEY = "voyage-key-for-tests";

const call = (headers: HeadersInit = {}) =>
  new Request("http://localhost/api/cron/catalog", { headers });
const bearer = { authorization: `Bearer ${SECRET}` };

describe("handleCatalogCron before it touches anything (AC-10)", () => {
  const base = {
    db: forbiddenDb,
    cronSecret: SECRET,
    tmdbToken: TMDB_TOKEN,
    voyageKey: VOYAGE_KEY,
  };

  it("answers 401 for a missing token, a wrong token and a wrong scheme", async () => {
    const attempts: Record<string, string>[] = [
      {},
      { authorization: "Bearer wrong" },
      { authorization: SECRET },
    ];
    for (const headers of attempts) {
      const response = await handleCatalogCron(call(headers), base);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("answers 401 to every call when CRON_SECRET is not set", async () => {
    for (const cronSecret of [undefined, ""]) {
      const response = await handleCatalogCron(call(bearer), {
        ...base,
        cronSecret,
      });

      expect(response.status).toBe(401);
    }
  });

  it("checks the token before the configuration", async () => {
    const response = await handleCatalogCron(call(), {
      ...base,
      tmdbToken: undefined,
      voyageKey: undefined,
    });

    expect(response.status).toBe(401);
  });

  it("answers 500 config_missing, naming no variable, when a provider key is missing", async () => {
    for (const missing of [
      { tmdbToken: undefined },
      { voyageKey: undefined },
      { tmdbToken: "" },
      { voyageKey: "" },
    ]) {
      const response = await handleCatalogCron(call(bearer), {
        ...base,
        ...missing,
      });
      const text = await response.text();

      expect(response.status).toBe(500);
      // The purge runs before the config check (spec 0012, AC-16); with a
      // database that refuses every call it reports null.
      expect(JSON.parse(text)).toEqual({
        error: "config_missing",
        purged: null,
      });
      expect(text).not.toMatch(/TMDB|VOYAGE|CRON_SECRET|token|key/i);
    }
  });

  it("is never cached", async () => {
    const response = await handleCatalogCron(call(), base);

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("handleCatalogCron failures (AC-10, AC-15)", () => {
  const base = {
    cronSecret: SECRET,
    tmdbToken: TMDB_TOKEN,
    voyageKey: VOYAGE_KEY,
  };

  it("answers 503 when the database is lost, with a short code only", async () => {
    const broken = {
      select: () => {
        throw Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:5432"), {
          code: "ECONNREFUSED",
        });
      },
    } as unknown as Db;

    const response = await handleCatalogCron(call(bearer), {
      ...base,
      db: broken,
    });
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(text).error).toBe("db_unavailable");
    expect(text).not.toContain("10.0.0.1");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("the daily catalog job", () => {
  const ctx = useTestDb();
  const tmdbIds: number[] = [];
  const personIds: number[] = [];
  const today = new Date().toISOString().slice(0, 10);

  async function store(
    overrides: Parameters<typeof details>[1] = {},
    fetchedAt = "1971-01-01T00:00:00Z",
  ) {
    const movie = details(token(), overrides);
    tmdbIds.push(movie.id);
    personIds.push(...personIdsOf(movie));
    const stored = await persistMovie(ctx.db, mapDetails(movie));
    if (!stored.ok) throw new Error("fixture movie was not stored");
    await ctx.db
      .update(movies)
      .set({ fetchedAt: new Date(fetchedAt) })
      .where(eq(movies.id, stored.value.movieId));
    return { id: stored.value.movieId, movie };
  }

  const savedMovie = async (tmdbId: number) =>
    (
      await ctx.db
        .select({ movie: movies })
        .from(movieExternalIds)
        .innerJoin(movies, eq(movies.id, movieExternalIds.movieId))
        .where(eq(movieExternalIds.externalId, String(tmdbId)))
    )[0]?.movie;

  /**
   * One fetch for both providers. Other tests' movies share this database, so
   * the fake answers 500 for any TMDB id it does not know: the job counts them as
   * failed and never rewrites or removes them. For the same reason Voyage only
   * returns a usable vector for texts that mention one of `embedFor`: any other
   * movie gets a wrong sized vector, which the client turns into a failed movie,
   * so this test never writes an embedding for a movie it does not own.
   */
  function providers(
    options: Omit<FakeTmdbOptions, "unknownStatus">,
    voyage: { status?: number; embedFor?: string[] } = {},
  ) {
    const tmdb = fakeTmdb({ ...options, unknownStatus: 500 });
    const voyageCalls: number[] = [];
    const routed = (async (
      input: URL | string | Request,
      init?: RequestInit,
    ) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.hostname === "api.voyageai.com") {
        const body = JSON.parse(String(init?.body)) as { input: string[] };
        voyageCalls.push(body.input.length);
        if (voyage.status) return new Response("{}", { status: voyage.status });
        return Response.json({
          data: body.input.map((text, index) => ({
            index,
            embedding: new Array<number>(
              (voyage.embedFor ?? []).some((tag) => text.includes(tag))
                ? EMBEDDING_DIMENSIONS
                : 3,
            ).fill(0.25),
          })),
        });
      }
      return tmdb.fetch(input, init);
    }) as unknown as typeof fetch;
    return { fetch: routed, tmdb, voyageCalls };
  }

  const context = (fetchImpl: typeof fetch) => ({
    db: ctx.db,
    cronSecret: SECRET,
    tmdbToken: TMDB_TOKEN,
    voyageKey: VOYAGE_KEY,
    fetch: fetchImpl,
    sleep: async () => undefined,
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await removeCatalogRows(ctx.db, tmdbIds, personIds);
  });

  it("refreshes, removes, adds new hits, embeds and returns a RunSummary (AC-10, AC-11, AC-12)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const old = await store();
    const withdrawn = await store();
    const hitTag = token();
    const hit = details(hitTag, { release_date: daysAgo(20) });
    tmdbIds.push(hit.id);
    personIds.push(...personIdsOf(hit));
    const fake = providers(
      {
        movies: new Map([
          [old.movie.id, { ...old.movie, overview: "Refreshed by the job." }],
          [hit.id, hit],
        ]),
        notFound: new Set([withdrawn.movie.id]),
        hitPages: [[hit.id]],
      },
      { embedFor: [hitTag] },
    );

    const response = await handleCatalogCron(call(bearer), context(fake.fetch));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    const summary = runSummarySchema.parse(body);
    expect(summary.updated).toBeGreaterThanOrEqual(1);
    expect(summary.removed).toBeGreaterThanOrEqual(1);
    expect(summary.stored).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(summary.oldestAgeDays)).toBe(true);

    expect((await savedMovie(old.movie.id))?.overview).toBe(
      "Refreshed by the job.",
    );
    expect(
      (await savedMovie(old.movie.id))?.fetchedAt?.getFullYear(),
    ).toBeGreaterThan(2000);
    expect(
      (await savedMovie(withdrawn.movie.id))?.sourceMissingAt,
    ).not.toBeNull();
    const added = await savedMovie(hit.id);
    expect(added).toBeDefined();
    // The new movie has its vector. The job wrote it, or the embed tests, which
    // run beside this file and embed every listable movie, got there first.
    const vectors = await ctx.db
      .select()
      .from(movieEmbeddings)
      .where(eq(movieEmbeddings.movieId, added?.id ?? -1));
    expect(vectors).toHaveLength(1);
  });

  it("never lets a secret or key into the response or the log (AC-16)", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logged.push(args.join(" "));
    });
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      logged.push(args.join(" "));
    });
    await store();
    const fake = providers({ movies: new Map() }, { status: 503 });

    const response = await handleCatalogCron(call(bearer), context(fake.fetch));
    const text = await response.text();

    for (const secret of [SECRET, TMDB_TOKEN, VOYAGE_KEY]) {
      expect(text).not.toContain(secret);
      expect(logged.join("\n")).not.toContain(secret);
    }
    expect(logged.some((line) => line.includes('"event":"catalog_sync"'))).toBe(
      true,
    );
  });

  it("goes on, with a warning, when Voyage fails, and leaves the new movies for the next run (AC-10)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const hit = details(token(), { release_date: daysAgo(10) });
    tmdbIds.push(hit.id);
    personIds.push(...personIdsOf(hit));
    const fake = providers(
      { movies: new Map([[hit.id, hit]]), hitPages: [[hit.id]] },
      { status: 503 },
    );

    const response = await handleCatalogCron(call(bearer), context(fake.fetch));

    expect(response.status).toBe(200);
    const summary = runSummarySchema.parse(await response.json());
    expect(summary.stored).toBeGreaterThanOrEqual(1);
    expect(summary.embedded).toBe(0);
    expect(warn.mock.calls.flat().join(" ")).toContain("embedding stopped");
    expect(await savedMovie(hit.id)).toBeDefined();
  });

  it("answers 500 tmdb_unauthorized when TMDB refuses the token, and removes nothing (AC-15)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const victim = await store();
    const fake = providers({ movies: new Map(), allStatus: 401 });

    const response = await handleCatalogCron(call(bearer), context(fake.fetch));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("tmdb_unauthorized");
    expect(body.summary.failed).toBe(0);
    expect((await savedMovie(victim.movie.id))?.sourceMissingAt).toBeNull();
  });

  describe("runCatalogSync", () => {
    it("starts no new work after the 45 second budget and still returns a summary (AC-10)", async () => {
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      await store();
      const fake = fakeTmdb({ movies: new Map(), unknownStatus: 500 });
      const voyage = fakeVoyage();
      let reads = 0;
      // The first read starts the budget. Every later read is far past it.
      const now = () => (reads++ === 0 ? 0 : TIME_BUDGET_MS * 100);

      const result = await runCatalogSync({
        db: ctx.db,
        tmdb: createTmdbClient({ token: TMDB_TOKEN, fetch: fake.fetch }),
        voyage: voyage.client,
        today,
        now,
      });

      expect(result.ok).toBe(true);
      expect(fake.calls).toEqual([]);
      expect(voyage.batches).toEqual([]);
      expect(result.ok && result.value).toMatchObject({
        stored: 0,
        updated: 0,
        removed: 0,
        embedded: 0,
      });
    });

    it("reports the age of the oldest live movie in whole days and warns past 120 days (AC-11)", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      await store({}, "1971-01-01T00:00:00Z");
      const fake = fakeTmdb({ movies: new Map(), unknownStatus: 500 });
      let reads = 0;
      const now = () => (reads++ === 0 ? 0 : TIME_BUDGET_MS * 100);

      const result = await runCatalogSync({
        db: ctx.db,
        tmdb: createTmdbClient({ token: TMDB_TOKEN, fetch: fake.fetch }),
        voyage: fakeVoyage().client,
        today,
        now,
      });

      expect(result.ok).toBe(true);
      const age = result.ok ? result.value.oldestAgeDays : null;
      expect(Number.isInteger(age)).toBe(true);
      expect(age).toBeGreaterThan(STALE_WARNING_DAYS);
      expect(warn.mock.calls.flat().join(" ")).toContain("oldest movie is");
      const line = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
      expect(line).toMatchObject({ event: "catalog_sync", oldestAgeDays: age });
    });

    it("does not count a removed movie when it reports the oldest age (AC-11)", async () => {
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      // One update, so there is never a moment where this ancient row is live and
      // could be picked by a refresh in another test file.
      const gone = await store({}, new Date().toISOString());
      await ctx.db
        .update(movies)
        .set({
          fetchedAt: new Date("1960-01-01T00:00:00Z"),
          sourceMissingAt: new Date(),
        })
        .where(eq(movies.id, gone.id));
      const fake = fakeTmdb({ movies: new Map(), unknownStatus: 500 });
      let reads = 0;
      const now = () => (reads++ === 0 ? 0 : TIME_BUDGET_MS * 100);

      const result = await runCatalogSync({
        db: ctx.db,
        tmdb: createTmdbClient({ token: TMDB_TOKEN, fetch: fake.fetch }),
        voyage: fakeVoyage().client,
        today,
        now,
      });

      // The removed 1960 row would make this about 24,000 days. It must be left out.
      const [expected] = (
        await ctx.pool.query(
          `select floor(extract(epoch from (now() - min(fetched_at))) / 86400)::int as days
           from movies where source_missing_at is null`,
        )
      ).rows;
      expect(result.ok && result.value.oldestAgeDays).toBe(expected.days);
      expect(expected.days).toBeLessThan(23_000);
    });
  });
});

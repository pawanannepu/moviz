import { eq, inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VoyageClient } from "@/catalog/embedding/voyage-client";
import { createDb } from "@/db/create-db";
import { movies, searchUsage } from "@/db/schema";
import { setFeedback } from "@/feedback/feedback";
import {
  bandStart,
  useRecommendFixtures,
  vec,
} from "@/test-support/recommend-fixtures";
import { TEST_DATABASE_URL, token, useTestDb } from "@/test-support/test-db";
import { runBiteSearch } from "./run-bite-search";
import type { BitePick } from "./types";
import { VOYAGE_QUERY_TIMEOUT_MS } from "./weights";

// Spec 0012: one search end to end against the test branch, with Voyage
// replaced by a fake (the phrase vector is the test's choice). Covers the
// quota order (AC-3), the exclusions and the cap (AC-6), the blend and the
// anchors (AC-7), the reasons (AC-8), words mode (AC-9), the time limit
// (AC-10) and that nothing is logged (AC-15). The vectors use band 4, which
// no other test file uses.
const BAND = 4;
const D = bandStart(BAND);
/** The phrase vector every vibe test searches with. */
const PHRASE = vec([[D, 1]]);

type VoyageBehavior = number[] | null | "fail" | "hang" | "throw";

function fakeVoyage(behavior: VoyageBehavior) {
  const calls: { text: string; timeoutMs?: number }[] = [];
  const client: VoyageClient = {
    embedDocuments: async () => ({ ok: true, value: [] }),
    embedQuery: async (text, options) => {
      calls.push({ text, timeoutMs: options?.timeoutMs });
      if (behavior === "hang") return new Promise(() => undefined);
      if (behavior === "throw") throw new Error(`boom ${text}`);
      if (behavior === "fail") {
        return {
          ok: false,
          error: { code: "voyage_unavailable", status: 503 },
        };
      }
      return { ok: true, value: behavior };
    },
  };
  return { client, calls };
}

describe.skipIf(!TEST_DATABASE_URL)("runBiteSearch (database)", () => {
  const t = useTestDb();
  const f = useRecommendFixtures(() => t.db, {
    band: BAND,
    // Dimension D is the phrase itself, so private dimensions start after it.
    privateFrom: D + 1,
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const search = (
    userId: string,
    phrase: string,
    behavior: VoyageBehavior | "none" = PHRASE,
    wait?: (ms: number) => Promise<void>,
  ) => {
    const voyage = behavior === "none" ? null : fakeVoyage(behavior).client;
    return runBiteSearch({ db: t.db, voyage, wait }, { userId, phrase });
  };

  async function picksOf(result: Awaited<ReturnType<typeof runBiteSearch>>) {
    if (!result.ok) throw new Error(`search failed: ${result.error.code}`);
    return result.value.picks;
  }
  const idsOf = (picks: BitePick[]) => picks.map((p) => p.movie.id);
  const usage = async (userId: string) =>
    (
      await t.db
        .select()
        .from(searchUsage)
        .where(eq(searchUsage.userId, userId))
    )[0]?.count ?? 0;

  describe("vibe mode (AC-6, AC-7, AC-8)", () => {
    it("ranks the movie closest to the phrase first, in vibe mode, with the filters it read", async () => {
      const user = await t.fx.newUser();
      const [closest, farther] = await f.addMovies([
        { vector: PHRASE },
        {
          vector: vec([
            [D, 0.7],
            [f.privateDim(), 0.71],
          ]),
        },
      ]);

      const result = await search(user.id, "a moody one");

      expect(result.ok && result.value.mode).toBe("vibe");
      expect(result.ok && result.value.filters).toEqual({ labels: [] });
      const ids = idsOf(await picksOf(result));
      expect(ids[0]).toBe(closest);
      expect(ids.indexOf(closest)).toBeLessThan(ids.indexOf(farther));
    });

    it("returns at most 8 picks", async () => {
      const user = await t.fx.newUser();
      await f.addMovies(Array.from({ length: 10 }, () => ({ vector: PHRASE })));

      expect(await picksOf(await search(user.id, "a moody one"))).toHaveLength(
        8,
      );
    });

    it("lifts a movie near a liked one above an equal movie that is not, and names the liked movie", async () => {
      const user = await t.fx.newUser();
      const likedDim = f.privateDim();
      const otherDim = f.privateDim();
      const [liked, nearLiked, notNear] = await f.addMovies([
        { vector: vec([[likedDim, 1]]) },
        {
          vector: vec([
            [D, 0.8],
            [likedDim, 0.6],
          ]),
        },
        {
          vector: vec([
            [D, 0.8],
            [otherDim, 0.6],
          ]),
        },
      ]);
      await f.rate(user.id, [{ movieId: liked, score: 10 }]);

      const picks = await picksOf(await search(user.id, "a moody one"));

      const ids = idsOf(picks);
      expect(ids.indexOf(nearLiked)).toBeLessThan(ids.indexOf(notNear));
      const lifted = picks.find((p) => p.movie.id === nearLiked);
      expect(lifted?.reason).toEqual({
        kind: "bite_vibe",
        phrase: "a moody one",
        anchor: {
          movieId: liked,
          title: expect.any(String),
          releaseYear: null,
        },
      });
    });

    it("names no movie when the closest liked movie is under 0.5 cosine", async () => {
      const user = await t.fx.newUser();
      const likedDim = f.privateDim();
      const [liked, faint] = await f.addMovies([
        { vector: vec([[likedDim, 1]]) },
        {
          vector: vec([
            [D, 0.9165],
            [likedDim, 0.4],
          ]),
        },
      ]);
      await f.rate(user.id, [{ movieId: liked, score: 10 }]);

      const picks = await picksOf(await search(user.id, "a moody one"));

      expect(picks.find((p) => p.movie.id === faint)?.reason).toEqual({
        kind: "bite_vibe",
        phrase: "a moody one",
        anchor: null,
      });
    });

    it("uses a More like this movie as a liked anchor too", async () => {
      const user = await t.fx.newUser();
      const askedDim = f.privateDim();
      const [asked, nearAsked] = await f.addMovies([
        { vector: vec([[askedDim, 1]]) },
        {
          vector: vec([
            [D, 0.8],
            [askedDim, 0.6],
          ]),
        },
      ]);
      await setFeedback(t.db, {
        userId: user.id,
        movieId: asked,
        kind: "more_like_this",
      });

      const picks = await picksOf(await search(user.id, "a moody one"));

      const pick = picks.find((p) => p.movie.id === nearAsked);
      expect(pick?.reason).toMatchObject({ anchor: { movieId: asked } });
    });

    it("gives a disliked movie no part in the ranking or the reasons", async () => {
      const user = await t.fx.newUser();
      const [disliked, sameAsDisliked] = await f.addMovies([
        { vector: PHRASE },
        { vector: PHRASE },
      ]);
      await f.rate(user.id, [{ movieId: disliked, score: 1 }]);

      const picks = await picksOf(await search(user.id, "a moody one"));

      expect(idsOf(picks)[0]).toBe(sameAsDisliked);
      expect(
        picks.every(
          (p) => p.reason.kind === "bite_vibe" && p.reason.anchor === null,
        ),
      ).toBe(true);
    });

    it("never shows a rated, skipped, hidden or unlisted movie", async () => {
      const user = await t.fx.newUser();
      const [rated, skipped, hidden, noPoster, removed, kept] =
        await f.addMovies([
          { vector: PHRASE },
          { vector: PHRASE },
          { vector: PHRASE },
          { vector: PHRASE, poster: false },
          { vector: PHRASE, removed: true },
          {
            vector: vec([
              [D, 0.95],
              [f.privateDim(), 0.31],
            ]),
          },
        ]);
      await f.rate(user.id, [{ movieId: rated, score: 4 }]);
      await f.skip(user.id, skipped);
      await setFeedback(t.db, {
        userId: user.id,
        movieId: hidden,
        kind: "not_interested",
      });

      const ids = idsOf(await picksOf(await search(user.id, "a moody one")));

      expect(ids).toContain(kept);
      for (const gone of [rated, skipped, hidden, noPoster, removed]) {
        expect(ids).not.toContain(gone);
      }
    });

    it("keeps a movie the user asked for more like visible", async () => {
      const user = await t.fx.newUser();
      const [asked] = await f.addMovies([{ vector: PHRASE }]);
      await setFeedback(t.db, {
        userId: user.id,
        movieId: asked,
        kind: "more_like_this",
      });

      expect(
        idsOf(await picksOf(await search(user.id, "a moody one"))),
      ).toContain(asked);
    });
  });

  describe("filters (AC-4, AC-6)", () => {
    it("leaves out a long movie and a movie with no runtime for a short search", async () => {
      const user = await t.fx.newUser();
      const [fits, tooLong, noRuntime] = await f.addMovies([
        { vector: PHRASE },
        { vector: PHRASE },
        { vector: PHRASE },
      ]);
      await t.db
        .update(movies)
        .set({ runtimeMinutes: 100 })
        .where(eq(movies.id, fits));
      await t.db
        .update(movies)
        .set({ runtimeMinutes: 101 })
        .where(eq(movies.id, tooLong));

      const result = await search(user.id, "something short");

      expect(result.ok && result.value.filters).toEqual({
        runtimeMax: 100,
        labels: ["under 100 minutes"],
      });
      const ids = idsOf(await picksOf(result));
      expect(ids).toContain(fits);
      expect(ids).not.toContain(tooLong);
      expect(ids).not.toContain(noRuntime);
    });

    it("keeps only 1980 to 1989 for an 80s search, and no movie without a year", async () => {
      const user = await t.fx.newUser();
      const [first, last, before, after, noYear] = await f.addMovies([
        { vector: PHRASE, releaseDate: "1980-01-01" },
        { vector: PHRASE, releaseDate: "1989-12-31" },
        { vector: PHRASE, releaseDate: "1979-12-31" },
        { vector: PHRASE, releaseDate: "1990-01-01" },
        { vector: PHRASE, releaseDate: null },
      ]);

      const ids = idsOf(await picksOf(await search(user.id, "an 80s one")));

      expect(ids).toEqual(expect.arrayContaining([first, last]));
      for (const gone of [before, after, noYear])
        expect(ids).not.toContain(gone);
    });

    it("keeps at least 150 minutes for a long search", async () => {
      const user = await t.fx.newUser();
      const [epic, shorter] = await f.addMovies([
        { vector: PHRASE },
        { vector: PHRASE },
      ]);
      await t.db
        .update(movies)
        .set({ runtimeMinutes: 150 })
        .where(eq(movies.id, epic));
      await t.db
        .update(movies)
        .set({ runtimeMinutes: 149 })
        .where(eq(movies.id, shorter));

      const ids = idsOf(await picksOf(await search(user.id, "a long one")));

      expect(ids).toContain(epic);
      expect(ids).not.toContain(shorter);
    });
  });

  describe("words mode (AC-9, AC-10)", () => {
    async function wordMovies() {
      const word = `zq${token()}`;
      const [inTitle, inOverview] = await f.addMovies([
        { vector: null },
        { vector: null },
      ]);
      await t.db
        .update(movies)
        .set({ title: `The ${word} Affair`, voteCount: 1 })
        .where(eq(movies.id, inTitle));
      await t.db
        .update(movies)
        .set({ overview: `A story about ${word}.`, voteCount: 900_000 })
        .where(eq(movies.id, inOverview));
      return { word, inTitle, inOverview };
    }

    it.each([
      ["Voyage is not configured", "none"],
      ["Voyage fails", "fail"],
      ["Voyage throws", "throw"],
      ["Voyage returns a wrong sized vector", null],
    ] as const)(
      "runs in words mode when %s, title matches first",
      async (_case, behavior) => {
        const user = await t.fx.newUser();
        const { word, inTitle, inOverview } = await wordMovies();

        const result = await search(user.id, word, behavior);

        expect(result.ok && result.value.mode).toBe("words");
        const picks = await picksOf(result);
        expect(idsOf(picks).slice(0, 2)).toEqual([inTitle, inOverview]);
        expect(picks[0].reason).toEqual({ kind: "bite_words", phrase: word });
      },
    );

    it("falls back to words mode when Voyage never answers within its limit", async () => {
      const user = await t.fx.newUser();
      const { word, inTitle } = await wordMovies();
      const { client, calls } = fakeVoyage("hang");
      const waits: number[] = [];

      const result = await runBiteSearch(
        {
          db: t.db,
          voyage: client,
          wait: async (ms) => {
            waits.push(ms);
          },
        },
        { userId: user.id, phrase: word },
      );

      expect(result.ok && result.value.mode).toBe("words");
      expect(idsOf(await picksOf(result))).toContain(inTitle);
      expect(waits[0]).toBeLessThanOrEqual(VOYAGE_QUERY_TIMEOUT_MS);
      expect(calls[0].timeoutMs).toBe(waits[0]);
    });

    it("matches any of the words, not all of them, and drops the rule words", async () => {
      const user = await t.fx.newUser();
      const { word, inTitle } = await wordMovies();
      // "quick" is a rule word: it filters to 100 minutes and leaves the query.
      await t.db
        .update(movies)
        .set({ runtimeMinutes: 90 })
        .where(eq(movies.id, inTitle));

      const ids = idsOf(
        await picksOf(await search(user.id, `a quick ${word} night`, "none")),
      );

      expect(ids).toContain(inTitle);
    });

    it("applies the filters in words mode too", async () => {
      const user = await t.fx.newUser();
      const { word, inTitle } = await wordMovies();
      await t.db
        .update(movies)
        .set({ runtimeMinutes: 200 })
        .where(eq(movies.id, inTitle));

      const ids = idsOf(
        await picksOf(await search(user.id, `short ${word}`, "none")),
      );

      expect(ids).not.toContain(inTitle);
    });

    it("returns no picks when only stop words and rule words are left", async () => {
      const user = await t.fx.newUser();

      const result = await search(
        user.id,
        "the short one from the 80s",
        "none",
      );

      expect(result.ok && result.value.picks).toEqual([]);
      expect(result.ok && result.value.mode).toBe("words");
    });
  });

  describe("quota (AC-3)", () => {
    it("charges one search before calling Voyage", async () => {
      const user = await t.fx.newUser();
      let usageAtCall = -1;
      const voyage: VoyageClient = {
        ...fakeVoyage(PHRASE).client,
        embedQuery: async () => {
          usageAtCall = await usage(user.id);
          return { ok: true, value: PHRASE };
        },
      };

      await runBiteSearch(
        { db: t.db, voyage },
        { userId: user.id, phrase: "a moody one" },
      );

      expect(usageAtCall).toBe(1);
    });

    it("refuses the 31st search without calling Voyage", async () => {
      const user = await t.fx.newUser();
      await t.db.execute(sql`
        insert into search_usage (user_id, day, count)
        values (${user.id}, (now() at time zone 'utc')::date, 30)
      `);
      const { client, calls } = fakeVoyage(PHRASE);

      const result = await runBiteSearch(
        { db: t.db, voyage: client },
        { userId: user.id, phrase: "a moody one" },
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: "quota_exceeded" },
      });
      expect(calls).toHaveLength(0);
    });

    it("still counts a search whose Voyage call failed", async () => {
      const user = await t.fx.newUser();

      await search(user.id, "a moody one", "fail");

      expect(await usage(user.id)).toBe(1);
    });
  });

  describe("privacy (AC-15)", () => {
    it("logs nothing while Voyage fails and words mode runs", async () => {
      const user = await t.fx.newUser();
      const phrase = `private phrase ${token()}`;
      const spies = (["log", "info", "warn", "error", "debug"] as const).map(
        (name) => vi.spyOn(console, name).mockImplementation(() => undefined),
      );

      await search(user.id, phrase, "throw");

      expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    });

    it("sends Voyage the phrase only, with no user id", async () => {
      const user = await t.fx.newUser();
      const { client, calls } = fakeVoyage(PHRASE);

      await runBiteSearch(
        { db: t.db, voyage: client },
        { userId: user.id, phrase: "a moody one" },
      );

      expect(calls.map((c) => c.text)).toEqual(["a moody one"]);
    });
  });

  it("leaves the user's own rows only (sanity: no other user's usage changes)", async () => {
    const [user, other] = [await t.fx.newUser(), await t.fx.newUser()];

    await search(user.id, "a moody one", "none");

    const rows = await t.db
      .select()
      .from(searchUsage)
      .where(inArray(searchUsage.userId, [user.id, other.id]));
    expect(rows.map((row) => row.userId)).toEqual([user.id]);
  });
});

describe("runBiteSearch when the database is down", () => {
  it("returns db_unavailable and never calls Voyage", async () => {
    const down = createDb("postgres://nobody:x@127.0.0.1:1/none");
    const { client, calls } = fakeVoyage(PHRASE);
    try {
      const result = await runBiteSearch(
        { db: down.db, voyage: client },
        { userId: "user-1", phrase: "a moody one" },
      );

      expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
      expect(calls).toHaveLength(0);
    } finally {
      await down.pool.end();
    }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/create-db";
import { err, ok } from "@/lib/result";
import type { Pick, Recommendations } from "@/recommend/types";
import { MAX_SHOWN } from "@/recommend/weights";

// `recommendMovies` has its own database tests (spec 0007). These tests cover
// what the feed adds: one call per batch, the reason sentences and the `done`
// rule (spec 0008, AC-2, AC-3, AC-9, AC-13).
const recommendMovies = vi.fn();
vi.mock("@/recommend/recommend-movies", () => ({
  recommendMovies: (...args: unknown[]) => recommendMovies(...args),
}));

// Which picks are pressed "More like this" is one more read (spec 0011).
vi.mock("@/feedback/feedback", () => ({
  moreLikeThisIds: async () => ({ ok: true, value: new Set<number>() }),
}));

import { FEED_BATCH_SIZE } from "./constants";
import { loadFeedBatch } from "./load-feed-batch";

const db = { name: "fake-db" } as unknown as Db;

function pick(id: number, overrides: Partial<Pick> = {}): Pick {
  return {
    movie: {
      id,
      title: `Movie ${id}`,
      releaseYear: 2000,
      posterPath: null,
      genres: [],
    },
    reason: {
      kind: "similar_to_liked",
      anchor: { movieId: 900, title: "Heat", releaseYear: 1995, score: 9 },
    },
    ...overrides,
  };
}

function picks(count: number, from = 1): Pick[] {
  return Array.from({ length: count }, (_, index) => pick(from + index));
}

function recommendations(
  list: Pick[],
  strength: Recommendations["profile"]["strength"] = "ok",
): Recommendations {
  return {
    picks: list,
    profile: { likedCount: 5, dislikedCount: 0, strength },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadFeedBatch", () => {
  it("makes exactly one recommender call with the batch size and the shown ids (AC-2, AC-13)", async () => {
    recommendMovies.mockResolvedValue(ok(recommendations(picks(3))));

    await loadFeedBatch(db, { userId: "user-1", shown: [7, 8] });

    expect(recommendMovies).toHaveBeenCalledTimes(1);
    expect(recommendMovies).toHaveBeenCalledWith(db, {
      userId: "user-1",
      limit: FEED_BATCH_SIZE,
      shown: [7, 8],
    });
    expect(FEED_BATCH_SIZE).toBe(24);
  });

  it("keeps the recommender's order and passes each card through unchanged (AC-2)", async () => {
    const list = [pick(30), pick(10), pick(20)];
    recommendMovies.mockResolvedValue(ok(recommendations(list)));

    const result = await loadFeedBatch(db, { userId: "u", shown: [] });

    if (!result.ok) throw new Error("expected ok");
    expect(result.value.picks.map((entry) => entry.movie)).toEqual(
      list.map((entry) => entry.movie),
    );
  });

  it("words every reason as a non empty sentence (AC-3)", async () => {
    recommendMovies.mockResolvedValue(
      ok(
        recommendations([
          pick(1),
          pick(2, { reason: { kind: "popular" } }),
          pick(3, {
            reason: {
              kind: "similar_to_liked",
              anchor: {
                movieId: 9,
                title: "Alien",
                releaseYear: null,
                score: 6,
              },
            },
          }),
        ]),
      ),
    );

    const result = await loadFeedBatch(db, { userId: "u", shown: [] });

    if (!result.ok) throw new Error("expected ok");
    expect(result.value.picks.map((entry) => entry.reason)).toEqual([
      "Because you loved Heat (1995)",
      "Popular with film fans",
      "Because you rated Alien",
    ]);
  });

  it("hands back the taste strength for the early picks line (AC-4)", async () => {
    recommendMovies.mockResolvedValue(ok(recommendations(picks(2), "thin")));

    const result = await loadFeedBatch(db, { userId: "u", shown: [] });

    if (!result.ok) throw new Error("expected ok");
    expect(result.value.strength).toBe("thin");
  });

  it("is not done when the batch is full (AC-9)", async () => {
    recommendMovies.mockResolvedValue(
      ok(recommendations(picks(FEED_BATCH_SIZE))),
    );

    const result = await loadFeedBatch(db, { userId: "u", shown: [] });

    if (!result.ok) throw new Error("expected ok");
    expect(result.value.done).toBe(false);
  });

  it("is done when the batch is one short of full (AC-9)", async () => {
    recommendMovies.mockResolvedValue(
      ok(recommendations(picks(FEED_BATCH_SIZE - 1))),
    );

    const result = await loadFeedBatch(db, { userId: "u", shown: [] });

    if (!result.ok) throw new Error("expected ok");
    expect(result.value.done).toBe(true);
  });

  it("is done for an empty batch (AC-6, AC-9)", async () => {
    recommendMovies.mockResolvedValue(ok(recommendations([])));

    const result = await loadFeedBatch(db, { userId: "u", shown: [] });

    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toMatchObject({ picks: [], done: true });
  });

  it("is not done when the page would hold exactly the maximum (AC-9)", async () => {
    const shown = Array.from(
      { length: MAX_SHOWN - FEED_BATCH_SIZE },
      (_, i) => i + 1,
    );
    recommendMovies.mockResolvedValue(
      ok(recommendations(picks(FEED_BATCH_SIZE, 10_000))),
    );

    const result = await loadFeedBatch(db, { userId: "u", shown });

    if (!result.ok) throw new Error("expected ok");
    expect(result.value.done).toBe(false);
  });

  it("is done when the page would hold more than the maximum (AC-9)", async () => {
    const shown = Array.from(
      { length: MAX_SHOWN - FEED_BATCH_SIZE + 1 },
      (_, i) => i + 1,
    );
    recommendMovies.mockResolvedValue(
      ok(recommendations(picks(FEED_BATCH_SIZE, 10_000))),
    );

    const result = await loadFeedBatch(db, { userId: "u", shown });

    if (!result.ok) throw new Error("expected ok");
    expect(result.value.done).toBe(true);
  });

  it("counts distinct shown ids, so a repeated id does not end the feed early (AC-9)", async () => {
    const shown = Array.from({ length: 400 }, () => 5);
    recommendMovies.mockResolvedValue(
      ok(recommendations(picks(FEED_BATCH_SIZE, 10_000))),
    );

    const result = await loadFeedBatch(db, { userId: "u", shown });

    if (!result.ok) throw new Error("expected ok");
    expect(result.value.done).toBe(false);
  });

  it("returns db_unavailable when the recommender cannot reach the database (AC-7)", async () => {
    recommendMovies.mockResolvedValue(err({ code: "db_unavailable" }));

    const result = await loadFeedBatch(db, { userId: "u", shown: [] });

    expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
  });

  it("throws, with a message that holds no data, when the recommender calls the input invalid (AC-14)", async () => {
    recommendMovies.mockResolvedValue(err({ code: "invalid_input" }));

    const attempt = loadFeedBatch(db, {
      userId: "secret-user-id",
      shown: [4242],
    });

    await expect(attempt).rejects.toThrow(
      "The feed sent the recommender an invalid input.",
    );
    await attempt.catch((error: Error) => {
      expect(error.message).not.toContain("secret-user-id");
      expect(error.message).not.toContain("4242");
    });
  });
});

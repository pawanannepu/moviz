import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import { MAX_SHOWN } from "@/recommend/weights";
import type { FeedPick } from "./types";

// `loadFeedBatch` has its own tests. These tests cover what the Server Action
// adds: the live session, Zod input checks, the typed result and that it never
// logs or takes a user id from the client (spec 0008, AC-11, AC-14).
const getUserForAction = vi.fn();
const loadFeedBatch = vi.fn();
const { fakeDb } = vi.hoisted(() => ({ fakeDb: { name: "fake-db" } }));

vi.mock("@/auth/session", () => ({
  getUserForAction: () => getUserForAction(),
}));
vi.mock("@/db/client", () => ({ db: fakeDb }));
vi.mock("./load-feed-batch", () => ({
  loadFeedBatch: (...args: unknown[]) => loadFeedBatch(...args),
}));

import { loadMoreAction } from "./actions";

const SESSION_USER = "session-user";
const signedIn = () =>
  getUserForAction.mockResolvedValue({ ok: true, user: { id: SESSION_USER } });

const PICK: FeedPick = {
  movie: {
    id: 11,
    title: "Secret Title",
    releaseYear: 1999,
    posterPath: null,
    genres: [],
  },
  reason: "Because you loved Secret Anchor (1995)",
  moreLikeThis: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  signedIn();
  loadFeedBatch.mockResolvedValue(
    ok({ picks: [PICK], strength: "ok", done: false }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadMoreAction session (AC-11)", () => {
  it("returns unauthenticated without a session and reads nothing", async () => {
    getUserForAction.mockResolvedValue({ ok: false, error: "unauthenticated" });

    const result = await loadMoreAction({ shown: [1] });

    expect(result).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(loadFeedBatch).not.toHaveBeenCalled();
  });

  it("checks the session before it checks the input", async () => {
    getUserForAction.mockResolvedValue({ ok: false, error: "unauthenticated" });

    const result = await loadMoreAction("not even an object");

    expect(result).toEqual({ ok: false, error: { code: "unauthenticated" } });
  });

  it("uses the session user, and ignores a userId sent in the input", async () => {
    await loadMoreAction({ shown: [1, 2], userId: "someone-else" });

    expect(loadFeedBatch).toHaveBeenCalledWith(fakeDb, {
      userId: SESSION_USER,
      shown: [1, 2],
    });
  });
});

describe("loadMoreAction input (AC-11)", () => {
  const MAX_ID = Number.MAX_SAFE_INTEGER;
  const BAD_INPUTS: [string, unknown][] = [
    ["nothing", undefined],
    ["null", null],
    ["a string", "shown"],
    ["a missing shown list", {}],
    ["a shown value that is not a list", { shown: 5 }],
    [
      "501 ids",
      { shown: Array.from({ length: MAX_SHOWN + 1 }, (_, i) => i + 1) },
    ],
    ["an id of 0", { shown: [0] }],
    ["a negative id", { shown: [-4] }],
    ["a fractional id", { shown: [1.5] }],
    ["an id as a string", { shown: ["7"] }],
    ["an id above the safe integer range", { shown: [MAX_ID + 1] }],
    ["NaN", { shown: [Number.NaN] }],
    ["Infinity", { shown: [Number.POSITIVE_INFINITY] }],
  ];

  it.each(BAD_INPUTS)(
    "returns invalid_input and reads nothing for %s",
    async (_name, input) => {
      const result = await loadMoreAction(input);

      expect(result).toEqual({ ok: false, error: { code: "invalid_input" } });
      expect(loadFeedBatch).not.toHaveBeenCalled();
    },
  );

  it("accepts an empty shown list", async () => {
    const result = await loadMoreAction({ shown: [] });

    expect(result.ok).toBe(true);
  });

  it("accepts exactly 500 ids and the largest safe integer", async () => {
    const shown = Array.from({ length: MAX_SHOWN - 1 }, (_, i) => i + 1);

    const result = await loadMoreAction({ shown: [...shown, MAX_ID] });

    expect(result.ok).toBe(true);
    expect(loadFeedBatch).toHaveBeenCalledTimes(1);
  });
});

describe("loadMoreAction result (AC-11)", () => {
  it("returns the finished picks and the done flag, and nothing else", async () => {
    loadFeedBatch.mockResolvedValue(
      ok({ picks: [PICK], strength: "thin", done: true }),
    );

    const result = await loadMoreAction({ shown: [3] });

    expect(result).toEqual({ ok: true, value: { picks: [PICK], done: true } });
  });

  it("makes one batch call per press (AC-13)", async () => {
    await loadMoreAction({ shown: [1] });

    expect(loadFeedBatch).toHaveBeenCalledTimes(1);
  });

  it("maps a database failure to db_unavailable and does not throw", async () => {
    loadFeedBatch.mockResolvedValue(err({ code: "db_unavailable" }));

    const result = await loadMoreAction({ shown: [1] });

    expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
  });
});

describe("loadMoreAction privacy (AC-14)", () => {
  it("writes nothing to the console on success or failure", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );

    await loadMoreAction({ shown: [1] });
    loadFeedBatch.mockResolvedValue(err({ code: "db_unavailable" }));
    await loadMoreAction({ shown: [1] });
    await loadMoreAction({ shown: [0] });
    getUserForAction.mockResolvedValue({ ok: false, error: "unauthenticated" });
    await loadMoreAction({ shown: [1] });

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

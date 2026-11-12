import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import type { BiteSearchResult } from "./types";

// `runBiteSearch` has its own database tests. These cover what the Server
// Action adds (spec 0012, AC-14): the live session, the Zod and phrase checks,
// the onboarding gate, the order of the checks, the typed result, and that a
// user id never comes from the client (AC-2, AC-3, AC-15).
const getUserForAction = vi.fn();
const getProfile = vi.fn();
const runBiteSearch = vi.fn();
const createVoyageClient = vi.fn();
const { fakeDb, fakeEnv } = vi.hoisted(() => ({
  fakeDb: { name: "fake-db" },
  fakeEnv: { VOYAGE_API_KEY: "voyage-key" as string | undefined },
}));

vi.mock("@/auth/session", () => ({
  getUserForAction: () => getUserForAction(),
}));
vi.mock("@/db/client", () => ({ db: fakeDb }));
vi.mock("@/env", () => ({ env: fakeEnv }));
vi.mock("@/profile/profile", () => ({
  getProfile: (...args: unknown[]) => getProfile(...args),
}));
vi.mock("@/catalog/embedding/voyage-client", () => ({
  createVoyageClient: (...args: unknown[]) => createVoyageClient(...args),
}));
vi.mock("./run-bite-search", () => ({
  runBiteSearch: (...args: unknown[]) => runBiteSearch(...args),
}));

import { biteSearchAction } from "./actions";

const SESSION_USER = "session-user";
const VOYAGE = { name: "voyage-client" };
const RESULT: BiteSearchResult = {
  mode: "vibe",
  filters: { labels: [] },
  picks: [
    {
      movie: {
        id: 7,
        title: "Heat",
        releaseYear: 1995,
        posterPath: null,
        genres: [],
      },
      reason: { kind: "bite_vibe", phrase: "dark", anchor: null },
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  fakeEnv.VOYAGE_API_KEY = "voyage-key";
  getUserForAction.mockResolvedValue({ ok: true, user: { id: SESSION_USER } });
  getProfile.mockResolvedValue(ok({ onboardedAt: new Date() }));
  createVoyageClient.mockReturnValue(VOYAGE);
  runBiteSearch.mockResolvedValue(ok(RESULT));
});

describe("biteSearchAction (AC-14)", () => {
  it("runs the search for the session user with the normalized phrase", async () => {
    const result = await biteSearchAction({ phrase: "  a   dark   one " });

    expect(result).toEqual(ok(RESULT));
    expect(runBiteSearch).toHaveBeenCalledWith(
      { db: fakeDb, voyage: VOYAGE },
      { userId: SESSION_USER, phrase: "a dark one" },
    );
    expect(createVoyageClient).toHaveBeenCalledWith({ apiKey: "voyage-key" });
  });

  it("ignores a user id sent by the client", async () => {
    await biteSearchAction({ phrase: "a dark one", userId: "someone-else" });

    expect(runBiteSearch).toHaveBeenCalledWith(expect.anything(), {
      userId: SESSION_USER,
      phrase: "a dark one",
    });
    expect(getProfile).toHaveBeenCalledWith(fakeDb, { userId: SESSION_USER });
  });

  it("passes no Voyage client when the key is not set, so words mode runs (AC-9)", async () => {
    fakeEnv.VOYAGE_API_KEY = undefined;

    await biteSearchAction({ phrase: "a dark one" });

    expect(createVoyageClient).not.toHaveBeenCalled();
    expect(runBiteSearch).toHaveBeenCalledWith(
      { db: fakeDb, voyage: null },
      expect.anything(),
    );
  });
});

describe("biteSearchAction checks, in order (AC-2, AC-14)", () => {
  it("returns unauthenticated with no session, before reading anything else", async () => {
    getUserForAction.mockResolvedValue({ ok: false, error: "unauthenticated" });

    const result = await biteSearchAction({ phrase: "x" });

    expect(result).toEqual(err({ code: "unauthenticated" }));
    expect(getProfile).not.toHaveBeenCalled();
    expect(runBiteSearch).not.toHaveBeenCalled();
  });

  it.each([
    [{ phrase: " a " }, "too_short"],
    [{ phrase: "x".repeat(121) }, "too_long"],
    [{}, "bad_shape"],
    [{ phrase: 42 }, "bad_shape"],
    [null, "bad_shape"],
    [{ phrase: "x".repeat(2_001) }, "bad_shape"],
  ])(
    "refuses %j as invalid_input %s and spends nothing",
    async (input, reason) => {
      const result = await biteSearchAction(input);

      expect(result).toEqual(err({ code: "invalid_input", reason }));
      expect(getProfile).not.toHaveBeenCalled();
      expect(runBiteSearch).not.toHaveBeenCalled();
    },
  );

  it("returns not_onboarded before any quota is spent", async () => {
    getProfile.mockResolvedValue(ok({ onboardedAt: null }));

    const result = await biteSearchAction({ phrase: "a dark one" });

    expect(result).toEqual(err({ code: "not_onboarded" }));
    expect(runBiteSearch).not.toHaveBeenCalled();
  });

  it("maps a missing profile user to unauthenticated and a lost database to db_unavailable", async () => {
    getProfile.mockResolvedValueOnce(err({ code: "user_not_found" }));
    expect(await biteSearchAction({ phrase: "ab" })).toEqual(
      err({ code: "unauthenticated" }),
    );

    getProfile.mockResolvedValueOnce(err({ code: "db_unavailable" }));
    expect(await biteSearchAction({ phrase: "ab" })).toEqual(
      err({ code: "db_unavailable" }),
    );
    expect(runBiteSearch).not.toHaveBeenCalled();
  });
});

describe("biteSearchAction search errors (AC-3, AC-12)", () => {
  it("passes quota_exceeded through with its reset time", async () => {
    runBiteSearch.mockResolvedValue(
      err({ code: "quota_exceeded", resetsAt: "2026-11-13T00:00:00.000Z" }),
    );

    expect(await biteSearchAction({ phrase: "ab" })).toEqual(
      err({ code: "quota_exceeded", resetsAt: "2026-11-13T00:00:00.000Z" }),
    );
  });

  it("maps user_not_found to unauthenticated and keeps db_unavailable", async () => {
    runBiteSearch.mockResolvedValueOnce(err({ code: "user_not_found" }));
    expect(await biteSearchAction({ phrase: "ab" })).toEqual(
      err({ code: "unauthenticated" }),
    );

    runBiteSearch.mockResolvedValueOnce(err({ code: "db_unavailable" }));
    expect(await biteSearchAction({ phrase: "ab" })).toEqual(
      err({ code: "db_unavailable" }),
    );
  });

  it("logs nothing, so the phrase never reaches a log (AC-15)", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => undefined),
    );
    runBiteSearch.mockResolvedValue(err({ code: "db_unavailable" }));

    await biteSearchAction({ phrase: "my private mood" });

    expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    for (const spy of spies) spy.mockRestore();
  });
});

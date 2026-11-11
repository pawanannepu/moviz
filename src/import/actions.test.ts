import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";

// Spec 0009, AC-11 and AC-12: the Load more action adds the live session, Zod
// input checks and the mapping of each data error. The data function has its own
// database tests, so only the boundaries are replaced.
const getUserForAction = vi.fn();
const listUnmatched = vi.fn();
const { fakeDb } = vi.hoisted(() => ({ fakeDb: { name: "fake-db" } }));

vi.mock("@/auth/session", () => ({
  getUserForAction: () => getUserForAction(),
}));
vi.mock("@/db/client", () => ({ db: fakeDb }));
vi.mock("./list-unmatched", () => ({
  listUnmatched: (...args: unknown[]) => listUnmatched(...args),
}));

import { loadMoreUnmatchedAction } from "./actions";

const SESSION_USER = "session-user";
const PAGE = {
  rows: [{ rowNumber: 51, title: "Row 51", year: 1999, reason: "no_match" }],
  nextCursor: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  getUserForAction.mockResolvedValue({ ok: true, user: { id: SESSION_USER } });
  listUnmatched.mockResolvedValue(ok(PAGE));
});

describe("loadMoreUnmatchedAction (AC-11, AC-12)", () => {
  it("returns the page for the signed in user's import", async () => {
    const result = await loadMoreUnmatchedAction({ importId: 7, after: "abc" });

    expect(result).toEqual(ok(PAGE));
    expect(listUnmatched).toHaveBeenCalledWith(fakeDb, {
      userId: SESSION_USER,
      importId: 7,
      after: "abc",
    });
  });

  it("accepts a null cursor for the first page", async () => {
    await loadMoreUnmatchedAction({ importId: 7, after: null });
    expect(listUnmatched).toHaveBeenCalledWith(fakeDb, {
      userId: SESSION_USER,
      importId: 7,
      after: null,
    });
  });

  it("answers unauthenticated, and reads nothing, when there is no session", async () => {
    getUserForAction.mockResolvedValue({ ok: false, error: "unauthenticated" });

    expect(await loadMoreUnmatchedAction({ importId: 7, after: null })).toEqual(
      err({ code: "unauthenticated" }),
    );
    expect(listUnmatched).not.toHaveBeenCalled();
  });

  it("takes the user from the session and ignores a user id in the input (AC-12)", async () => {
    await loadMoreUnmatchedAction({
      importId: 7,
      after: null,
      userId: "someone-else",
    });

    expect(listUnmatched.mock.calls[0][1].userId).toBe(SESSION_USER);
  });

  it.each([
    ["no input", undefined],
    ["a string import id", { importId: "7", after: null }],
    ["a zero import id", { importId: 0, after: null }],
    ["a negative import id", { importId: -1, after: null }],
    ["a fractional import id", { importId: 1.5, after: null }],
    ["a missing cursor field", { importId: 7 }],
    ["an empty cursor", { importId: 7, after: "" }],
    ["a cursor over 200 characters", { importId: 7, after: "a".repeat(201) }],
    ["a number as the cursor", { importId: 7, after: 5 }],
  ])(
    "answers invalid_input for %s and reads nothing",
    async (_label, input) => {
      expect(await loadMoreUnmatchedAction(input)).toEqual(
        err({ code: "invalid_input" }),
      );
      expect(listUnmatched).not.toHaveBeenCalled();
    },
  );

  it.each(["invalid_cursor", "not_found", "db_unavailable"] as const)(
    "passes %s through as a typed result",
    async (code) => {
      listUnmatched.mockResolvedValue(err({ code }));

      expect(
        await loadMoreUnmatchedAction({ importId: 7, after: null }),
      ).toEqual(err({ code }));
    },
  );
});

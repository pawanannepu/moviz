import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";

// `setFeedback` and `clearFeedback` have their own database tests. These tests
// cover what the Server Action adds: the live session, the Zod input check, the
// choice between set and clear, the typed result, and that it never takes a
// user id from the client or logs anything (spec 0011, AC-12, AC-13, AC-14).
const getUserForAction = vi.fn();
const setFeedback = vi.fn();
const clearFeedback = vi.fn();
const { fakeDb } = vi.hoisted(() => ({ fakeDb: { name: "fake-db" } }));

vi.mock("@/auth/session", () => ({
  getUserForAction: () => getUserForAction(),
}));
vi.mock("@/db/client", () => ({ db: fakeDb }));
vi.mock("./feedback", () => ({
  setFeedback: (...args: unknown[]) => setFeedback(...args),
  clearFeedback: (...args: unknown[]) => clearFeedback(...args),
}));

import { setFeedbackAction } from "./actions";

const SESSION_USER = "session-user";

beforeEach(() => {
  vi.resetAllMocks();
  getUserForAction.mockResolvedValue({ ok: true, user: { id: SESSION_USER } });
  setFeedback.mockResolvedValue(ok(undefined));
  clearFeedback.mockResolvedValue(ok(undefined));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("setFeedbackAction session (AC-12, AC-13)", () => {
  it("returns unauthenticated without a session and writes nothing", async () => {
    getUserForAction.mockResolvedValue({ ok: false, error: "unauthenticated" });

    const result = await setFeedbackAction({
      movieId: 5,
      kind: "not_interested",
    });

    expect(result).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(setFeedback).not.toHaveBeenCalled();
    expect(clearFeedback).not.toHaveBeenCalled();
  });

  it("checks the session before the input, so a signed out bad input is unauthenticated", async () => {
    getUserForAction.mockResolvedValue({ ok: false, error: "unauthenticated" });

    expect(await setFeedbackAction({ movieId: "nope" })).toEqual({
      ok: false,
      error: { code: "unauthenticated" },
    });
  });

  it("uses the session user and ignores a user id sent by the client", async () => {
    await setFeedbackAction({
      movieId: 5,
      kind: "more_like_this",
      userId: "someone-else",
    });

    expect(setFeedback).toHaveBeenCalledWith(fakeDb, {
      userId: SESSION_USER,
      movieId: 5,
      kind: "more_like_this",
    });
  });
});

describe("setFeedbackAction input (AC-13)", () => {
  it.each([
    ["no input", undefined],
    ["a movie id of 0", { movieId: 0, kind: "not_interested" }],
    ["a negative movie id", { movieId: -3, kind: "not_interested" }],
    ["a fractional movie id", { movieId: 1.5, kind: "not_interested" }],
    ["a movie id as text", { movieId: "12", kind: "not_interested" }],
    ["an unsafe integer", { movieId: Number.MAX_SAFE_INTEGER + 1, kind: null }],
    ["an unknown kind", { movieId: 5, kind: "love" }],
    ["a missing kind", { movieId: 5 }],
  ])("returns invalid_input for %s and writes nothing", async (_, input) => {
    const result = await setFeedbackAction(input);

    expect(result).toEqual({ ok: false, error: { code: "invalid_input" } });
    expect(setFeedback).not.toHaveBeenCalled();
    expect(clearFeedback).not.toHaveBeenCalled();
  });
});

describe("setFeedbackAction result (AC-13)", () => {
  it.each(["not_interested", "more_like_this"] as const)(
    "saves %s and echoes the kind",
    async (kind) => {
      const result = await setFeedbackAction({ movieId: 5, kind });

      expect(result).toEqual(ok({ kind }));
      expect(setFeedback).toHaveBeenCalledTimes(1);
      expect(clearFeedback).not.toHaveBeenCalled();
    },
  );

  it("clears the row when kind is null", async () => {
    const result = await setFeedbackAction({ movieId: 5, kind: null });

    expect(result).toEqual(ok({ kind: null }));
    expect(clearFeedback).toHaveBeenCalledWith(fakeDb, {
      userId: SESSION_USER,
      movieId: 5,
    });
    expect(setFeedback).not.toHaveBeenCalled();
  });

  it("passes movie_not_found through", async () => {
    setFeedback.mockResolvedValue(err({ code: "movie_not_found" }));

    expect(
      await setFeedbackAction({ movieId: 9, kind: "not_interested" }),
    ).toEqual({ ok: false, error: { code: "movie_not_found" } });
  });

  it.each([
    ["a set", { movieId: 9, kind: "more_like_this" }],
    ["a clear", { movieId: 9, kind: null }],
  ])("passes db_unavailable through on %s", async (_, input) => {
    setFeedback.mockResolvedValue(err({ code: "db_unavailable" }));
    clearFeedback.mockResolvedValue(err({ code: "db_unavailable" }));

    expect(await setFeedbackAction(input)).toEqual({
      ok: false,
      error: { code: "db_unavailable" },
    });
  });
});

describe("setFeedbackAction privacy (AC-14)", () => {
  it("logs nothing on success or failure", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    setFeedback.mockResolvedValueOnce(ok(undefined));
    await setFeedbackAction({ movieId: 424242, kind: "not_interested" });
    setFeedback.mockResolvedValueOnce(err({ code: "db_unavailable" }));
    await setFeedbackAction({ movieId: 424242, kind: "more_like_this" });
    await setFeedbackAction({ movieId: "bad" });

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

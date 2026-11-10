import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";

// The data functions have their own database tests. These tests cover what the
// Server Actions add: the live session, Zod input checks, and the mapping of
// every data error to the action's typed result (spec 0006, AC-3, AC-5, AC-7,
// AC-10, AC-11). Only the boundaries are replaced.
const getUserForAction = vi.fn();
const saveSwipe = vi.fn();
const undoSwipe = vi.fn();
const countProgress = vi.fn();
const finishOnboarding = vi.fn();
const isMovieListable = vi.fn();
const { fakeDb } = vi.hoisted(() => ({ fakeDb: { name: "fake-db" } }));

vi.mock("@/auth/session", () => ({
  getUserForAction: () => getUserForAction(),
}));
vi.mock("@/db/client", () => ({ db: fakeDb }));
vi.mock("@/ratings/save-swipe", () => ({
  saveSwipe: (...args: unknown[]) => saveSwipe(...args),
}));
vi.mock("@/ratings/undo-swipe", () => ({
  undoSwipe: (...args: unknown[]) => undoSwipe(...args),
}));
vi.mock("./count-progress", () => ({
  countProgress: (...args: unknown[]) => countProgress(...args),
}));
vi.mock("./finish-onboarding", () => ({
  finishOnboarding: (...args: unknown[]) => finishOnboarding(...args),
}));
vi.mock("./is-movie-listable", () => ({
  isMovieListable: (...args: unknown[]) => isMovieListable(...args),
}));

import {
  finishOnboardingAction,
  swipeAction,
  undoSwipeAction,
} from "./actions";

const SESSION_USER = "session-user";
const signedIn = () =>
  getUserForAction.mockResolvedValue({
    ok: true,
    user: { id: SESSION_USER },
  });
const signedOut = () =>
  getUserForAction.mockResolvedValue({ ok: false, error: "unauthenticated" });

beforeEach(() => {
  vi.resetAllMocks();
  signedIn();
  isMovieListable.mockResolvedValue(ok(true));
  saveSwipe.mockResolvedValue(ok(undefined));
  undoSwipe.mockResolvedValue(ok({ restored: true }));
  countProgress.mockResolvedValue(ok({ rated: 4, shown: 6 }));
  finishOnboarding.mockResolvedValue(
    ok({ onboardedAt: new Date("2026-11-10T12:00:00.000Z") }),
  );
});

const BAD_INPUTS: [string, unknown][] = [
  ["nothing", undefined],
  ["null", null],
  ["a string", "liked"],
  ["a missing choice", { movieId: 1 }],
  ["a missing movie id", { choice: "liked" }],
  ["a zero movie id", { movieId: 0, choice: "liked" }],
  ["a negative movie id", { movieId: -3, choice: "liked" }],
  ["a fractional movie id", { movieId: 1.5, choice: "liked" }],
  ["a movie id sent as text", { movieId: "1", choice: "liked" }],
  ["an unknown choice", { movieId: 1, choice: "loved" }],
];

describe("swipeAction", () => {
  it("saves a liked swipe for the session user and returns the new counters (AC-3, AC-4)", async () => {
    const result = await swipeAction({ movieId: 7, choice: "liked" });

    expect(result).toEqual({ ok: true, value: { rated: 4, shown: 6 } });
    expect(saveSwipe).toHaveBeenCalledWith(fakeDb, {
      userId: SESSION_USER,
      movieId: 7,
      choice: "liked",
    });
    expect(countProgress).toHaveBeenCalledWith(fakeDb, {
      userId: SESSION_USER,
    });
  });

  it.each(["liked", "disliked", "not_seen"] as const)(
    "passes the %s choice through to saveSwipe (AC-3)",
    async (choice) => {
      await swipeAction({ movieId: 7, choice });

      expect(saveSwipe).toHaveBeenCalledWith(
        fakeDb,
        expect.objectContaining({ choice }),
      );
    },
  );

  it("takes the user from the session, never from the request (AC-11)", async () => {
    await swipeAction({
      movieId: 7,
      choice: "liked",
      userId: "someone-else",
    });

    expect(saveSwipe).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ userId: SESSION_USER }),
    );
    expect(countProgress).toHaveBeenCalledWith(fakeDb, {
      userId: SESSION_USER,
    });
  });

  it("returns unauthenticated and touches nothing without a session (AC-10, AC-11)", async () => {
    signedOut();

    const result = await swipeAction({ movieId: 7, choice: "liked" });

    expect(result).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(isMovieListable).not.toHaveBeenCalled();
    expect(saveSwipe).not.toHaveBeenCalled();
  });

  it.each(BAD_INPUTS)(
    "returns invalid_input for %s without saving (AC-11)",
    async (_name, input) => {
      const result = await swipeAction(input);

      expect(result).toEqual({ ok: false, error: { code: "invalid_input" } });
      expect(isMovieListable).not.toHaveBeenCalled();
      expect(saveSwipe).not.toHaveBeenCalled();
    },
  );

  it("checks the session before the input, so a signed out caller learns nothing about validity (AC-11)", async () => {
    signedOut();

    const result = await swipeAction({ nonsense: true });

    expect(result).toEqual({ ok: false, error: { code: "unauthenticated" } });
  });

  it("returns movie_not_found and saves nothing for a movie that is no longer listable (AC-3, AC-10)", async () => {
    isMovieListable.mockResolvedValue(ok(false));

    const result = await swipeAction({ movieId: 7, choice: "liked" });

    expect(result).toEqual({ ok: false, error: { code: "movie_not_found" } });
    expect(saveSwipe).not.toHaveBeenCalled();
  });

  it("returns db_unavailable when the listable check cannot reach the database (AC-10)", async () => {
    isMovieListable.mockResolvedValue(err({ code: "db_unavailable" }));

    const result = await swipeAction({ movieId: 7, choice: "liked" });

    expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
    expect(saveSwipe).not.toHaveBeenCalled();
  });

  it("returns db_unavailable when the save fails (AC-10)", async () => {
    saveSwipe.mockResolvedValue(err({ code: "db_unavailable" }));

    const result = await swipeAction({ movieId: 7, choice: "liked" });

    expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
    expect(countProgress).not.toHaveBeenCalled();
  });

  it("reports a deleted account as unauthenticated, not as a missing user (AC-10)", async () => {
    saveSwipe.mockResolvedValue(err({ code: "user_not_found" }));

    const result = await swipeAction({ movieId: 7, choice: "liked" });

    expect(result).toEqual({ ok: false, error: { code: "unauthenticated" } });
  });

  it("returns db_unavailable when counting fails after the write (AC-10)", async () => {
    countProgress.mockResolvedValue(err({ code: "db_unavailable" }));

    const result = await swipeAction({ movieId: 7, choice: "liked" });

    expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
  });

  it("counts after the write has committed, so the counters include this swipe (AC-4)", async () => {
    const order: string[] = [];
    saveSwipe.mockImplementation(async () => {
      order.push("save");
      return ok(undefined);
    });
    countProgress.mockImplementation(async () => {
      order.push("count");
      return ok({ rated: 1, shown: 1 });
    });

    await swipeAction({ movieId: 7, choice: "liked" });

    expect(order).toEqual(["save", "count"]);
  });
});

describe("undoSwipeAction", () => {
  it("undoes for the session user and returns the counters with restored (AC-5)", async () => {
    const result = await undoSwipeAction({ movieId: 7, choice: "liked" });

    expect(result).toEqual({
      ok: true,
      value: { rated: 4, shown: 6, restored: true },
    });
    expect(undoSwipe).toHaveBeenCalledWith(fakeDb, {
      userId: SESSION_USER,
      movieId: 7,
      choice: "liked",
    });
  });

  it("passes restored false through when nothing was deleted (AC-5)", async () => {
    undoSwipe.mockResolvedValue(ok({ restored: false }));

    const result = await undoSwipeAction({ movieId: 7, choice: "not_seen" });

    expect(result).toEqual({
      ok: true,
      value: { rated: 4, shown: 6, restored: false },
    });
  });

  it("takes the user from the session, never from the request (AC-11)", async () => {
    await undoSwipeAction({
      movieId: 7,
      choice: "liked",
      userId: "someone-else",
    });

    expect(undoSwipe).toHaveBeenCalledWith(fakeDb, {
      userId: SESSION_USER,
      movieId: 7,
      choice: "liked",
    });
  });

  it("returns unauthenticated and touches nothing without a session (AC-10, AC-11)", async () => {
    signedOut();

    const result = await undoSwipeAction({ movieId: 7, choice: "liked" });

    expect(result).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(undoSwipe).not.toHaveBeenCalled();
  });

  it.each(BAD_INPUTS)(
    "returns invalid_input for %s without deleting (AC-11)",
    async (_name, input) => {
      const result = await undoSwipeAction(input);

      expect(result).toEqual({ ok: false, error: { code: "invalid_input" } });
      expect(undoSwipe).not.toHaveBeenCalled();
    },
  );

  it("returns db_unavailable when the undo fails (AC-10)", async () => {
    undoSwipe.mockResolvedValue(err({ code: "db_unavailable" }));

    const result = await undoSwipeAction({ movieId: 7, choice: "liked" });

    expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
    expect(countProgress).not.toHaveBeenCalled();
  });

  it("reports a deleted account as unauthenticated (AC-10)", async () => {
    undoSwipe.mockResolvedValue(err({ code: "user_not_found" }));

    const result = await undoSwipeAction({ movieId: 7, choice: "liked" });

    expect(result).toEqual({ ok: false, error: { code: "unauthenticated" } });
  });

  it("returns db_unavailable when counting fails after the delete (AC-10)", async () => {
    countProgress.mockResolvedValue(err({ code: "db_unavailable" }));

    const result = await undoSwipeAction({ movieId: 7, choice: "liked" });

    expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
  });
});

describe("finishOnboardingAction", () => {
  it("finishes for the session user and returns the time as an ISO string (AC-7)", async () => {
    const result = await finishOnboardingAction();

    expect(result).toEqual({
      ok: true,
      value: { onboardedAt: "2026-11-10T12:00:00.000Z" },
    });
    expect(finishOnboarding).toHaveBeenCalledWith(fakeDb, {
      userId: SESSION_USER,
    });
  });

  it("returns unauthenticated and touches nothing without a session (AC-10, AC-11)", async () => {
    signedOut();

    const result = await finishOnboardingAction();

    expect(result).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(finishOnboarding).not.toHaveBeenCalled();
  });

  it("passes not_enough_ratings through (AC-7)", async () => {
    finishOnboarding.mockResolvedValue(err({ code: "not_enough_ratings" }));

    const result = await finishOnboardingAction();

    expect(result).toEqual({
      ok: false,
      error: { code: "not_enough_ratings" },
    });
  });

  it("passes db_unavailable through (AC-10)", async () => {
    finishOnboarding.mockResolvedValue(err({ code: "db_unavailable" }));

    const result = await finishOnboardingAction();

    expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
  });

  it("reports a deleted account as unauthenticated (AC-10)", async () => {
    finishOnboarding.mockResolvedValue(err({ code: "user_not_found" }));

    const result = await finishOnboardingAction();

    expect(result).toEqual({ ok: false, error: { code: "unauthenticated" } });
  });
});

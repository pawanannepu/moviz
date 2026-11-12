import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";

// `upsertProfile` has its own database tests. These tests cover what the
// Server Action adds: the live session, the Zod check against WATCH_REGIONS,
// the source `user`, and the typed result (spec 0013, AC-10).
const getUserForAction = vi.fn();
const upsertProfile = vi.fn();
const { fakeDb } = vi.hoisted(() => ({ fakeDb: { name: "fake-db" } }));

vi.mock("@/auth/session", () => ({
  getUserForAction: () => getUserForAction(),
}));
vi.mock("@/db/client", () => ({ db: fakeDb }));
vi.mock("@/profile/profile", () => ({
  upsertProfile: (...args: unknown[]) => upsertProfile(...args),
}));

import { setCountryAction } from "./actions";

const SESSION_USER = "session-user";

beforeEach(() => {
  vi.resetAllMocks();
  getUserForAction.mockResolvedValue({ ok: true, user: { id: SESSION_USER } });
  upsertProfile.mockResolvedValue(ok({ userId: SESSION_USER }));
});

describe("setCountryAction (AC-10)", () => {
  it("saves the country for the session user with source user", async () => {
    const result = await setCountryAction({ country: "FR" });

    expect(result).toEqual({ ok: true, value: { country: "FR" } });
    expect(upsertProfile).toHaveBeenCalledWith(fakeDb, {
      userId: SESSION_USER,
      country: "FR",
      countrySource: "user",
    });
  });

  it("trims and upper cases the code before the list check", async () => {
    expect(await setCountryAction({ country: " us " })).toEqual({
      ok: true,
      value: { country: "US" },
    });
  });

  it("returns unauthenticated without a session and writes nothing", async () => {
    getUserForAction.mockResolvedValue({ ok: false, error: "unauthenticated" });

    expect(await setCountryAction({ country: "FR" })).toEqual({
      ok: false,
      error: { code: "unauthenticated" },
    });
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown code", { country: "XX" }],
    ["a code that is not two letters", { country: "USA" }],
    ["a number", { country: 5 }],
    ["no country", {}],
    ["null", null],
  ])("returns invalid_input for %s", async (_label, input) => {
    expect(await setCountryAction(input)).toEqual({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("ignores a user id sent by the client", async () => {
    await setCountryAction({ country: "DE", userId: "someone-else" });

    expect(upsertProfile).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ userId: SESSION_USER }),
    );
  });

  it.each([
    ["db_unavailable", "db_unavailable"],
    ["user_not_found", "unauthenticated"],
    ["invalid_country", "invalid_input"],
  ] as const)("maps a %s save failure to %s", async (code, expected) => {
    upsertProfile.mockResolvedValue(err({ code }));

    expect(await setCountryAction({ country: "FR" })).toEqual({
      ok: false,
      error: { code: expected },
    });
  });

  it("logs nothing, so no country leaves the action", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => undefined),
    );

    await setCountryAction({ country: "FR" });
    upsertProfile.mockResolvedValue(err({ code: "db_unavailable" }));
    await setCountryAction({ country: "FR" });

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

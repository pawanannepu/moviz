import { afterEach, describe, expect, it, vi } from "vitest";
import { formatAuthEvent, logAuthEvent } from "./log-auth-event";

const NOW = new Date("2026-11-09T06:30:00.000Z");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formatAuthEvent (AC-16)", () => {
  it("holds the event, outcome and time", () => {
    expect(
      JSON.parse(formatAuthEvent({ event: "sign_out", outcome: "ok" }, NOW)),
    ).toEqual({
      type: "auth",
      event: "sign_out",
      outcome: "ok",
      at: "2026-11-09T06:30:00.000Z",
    });
  });

  it("adds the user id when it is known", () => {
    const line = JSON.parse(
      formatAuthEvent(
        { event: "sign_in", outcome: "ok", userId: "u_123" },
        NOW,
      ),
    );
    expect(line.userId).toBe("u_123");
  });

  it("leaves the user id out when it is not known or empty", () => {
    expect(
      formatAuthEvent({ event: "sign_in", outcome: "email_not_verified" }, NOW),
    ).not.toContain("userId");
    expect(
      formatAuthEvent({ event: "sign_in", outcome: "x", userId: "" }, NOW),
    ).not.toContain("userId");
  });

  it("has no field that could carry an email, password, token or address", () => {
    const sneaky = {
      event: "sign_in",
      outcome: "ok",
      email: "ana@example.com",
      password: "secret-pass",
      token: "abc.def.ghi",
      ip: "203.0.113.9",
    } as unknown as Parameters<typeof formatAuthEvent>[0];

    const line = formatAuthEvent(sneaky, NOW);

    expect(line).not.toContain("ana@example.com");
    expect(line).not.toContain("secret-pass");
    expect(line).not.toContain("abc.def.ghi");
    expect(line).not.toContain("203.0.113.9");
  });
});

describe("logAuthEvent", () => {
  it("writes one line to the server log", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logAuthEvent({ event: "reset_requested", outcome: "ok" });

    expect(info).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(info.mock.calls[0]?.[0])).event).toBe(
      "reset_requested",
    );
  });

  it("never throws, even when the log itself fails", () => {
    vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("log down");
    });

    expect(() =>
      logAuthEvent({ event: "sign_up", outcome: "ok" }),
    ).not.toThrow();
  });
});

// Spec 0014, AC-7 and AC-14: the data download gets a line with ids only.
describe("formatAuthEvent data_exported (spec 0014, AC-7, AC-14)", () => {
  it("holds the event, outcome, time and user id, and nothing else", () => {
    const line = JSON.parse(
      formatAuthEvent(
        { event: "data_exported", outcome: "ok", userId: "u_123" },
        NOW,
      ),
    );

    expect(line).toEqual({
      type: "auth",
      event: "data_exported",
      outcome: "ok",
      at: "2026-11-09T06:30:00.000Z",
      userId: "u_123",
    });
  });
});

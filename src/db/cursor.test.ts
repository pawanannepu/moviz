import { describe, expect, it } from "vitest";
import {
  clampLimit,
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  MAX_PAGE_SIZE,
} from "./cursor";

const encodeRaw = (value: unknown) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

describe("encodeCursor and decodeCursor (AC-16)", () => {
  it("round trips a position and keeps the microseconds", () => {
    const position = { timestamp: "2026-11-08 04:00:00.123456+00", id: 42 };
    const decoded = decodeCursor(encodeCursor(position));
    expect(decoded).toEqual({ ok: true, value: position });
  });

  it("accepts the timestamp forms Postgres prints", () => {
    for (const timestamp of [
      "2026-11-08 04:00:00+00",
      "2026-11-08 04:00:00.1+00",
      "2026-11-08 04:00:00.123456+05:30",
      "2026-11-08 04:00:00-08",
    ]) {
      const decoded = decodeCursor(encodeCursor({ timestamp, id: 1 }));
      expect(decoded.ok).toBe(true);
    }
  });

  it("is opaque and safe to put in a URL", () => {
    const cursor = encodeCursor({ timestamp: "2026-11-08 04:00:00+00", id: 7 });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cursor).not.toContain("2026");
  });

  it.each([
    ["an empty string", ""],
    ["text that is not base64 JSON", "not a cursor!!"],
    [
      "base64 of text that is not JSON",
      Buffer.from("hello").toString("base64url"),
    ],
  ])("rejects %s", (_name, cursor) => {
    expect(decodeCursor(cursor)).toEqual({
      ok: false,
      error: { code: "invalid_cursor" },
    });
  });

  it.each([
    ["a missing id", { t: "2026-11-08 04:00:00+00" }],
    ["a missing timestamp", { id: 1 }],
    ["a string id", { t: "2026-11-08 04:00:00+00", id: "1" }],
    ["a fractional id", { t: "2026-11-08 04:00:00+00", id: 1.5 }],
    [
      "an id beyond the safe integer range",
      { t: "2026-11-08 04:00:00+00", id: 2 ** 53 },
    ],
    ["an ISO timestamp with a T", { t: "2026-11-08T04:00:00Z", id: 1 }],
    [
      "a timestamp that carries SQL",
      { t: "2026-11-08'; drop table ratings; --", id: 1 },
    ],
    ["an array", []],
    ["null", null],
  ])("rejects a payload with %s", (_name, payload) => {
    const decoded = decodeCursor(encodeRaw(payload));
    expect(decoded.ok).toBe(false);
  });
});

describe("clampLimit (AC-16)", () => {
  it("defaults to 50 when no limit is given", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50);
    expect(clampLimit(undefined)).toBe(50);
  });

  it("caps at 100", () => {
    expect(MAX_PAGE_SIZE).toBe(100);
    expect(clampLimit(100)).toBe(100);
    expect(clampLimit(101)).toBe(100);
    expect(clampLimit(5000)).toBe(100);
  });

  it("never goes below 1", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-10)).toBe(1);
  });

  it("cuts a fractional limit down to a whole number", () => {
    expect(clampLimit(3.9)).toBe(3);
  });

  it("falls back to the default for NaN and infinity", () => {
    expect(clampLimit(Number.NaN)).toBe(50);
    expect(clampLimit(Number.POSITIVE_INFINITY)).toBe(50);
  });

  it("keeps a limit inside the range as it is", () => {
    expect(clampLimit(1)).toBe(1);
    expect(clampLimit(25)).toBe(25);
  });
});

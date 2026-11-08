import { describe, expect, it } from "vitest";
import { err, ok } from "./result";

describe("Result helpers", () => {
  it("ok wraps a value", () => {
    expect(ok(5)).toEqual({ ok: true, value: 5 });
  });

  it("ok keeps an undefined value", () => {
    expect(ok(undefined)).toEqual({ ok: true, value: undefined });
  });

  it("err wraps an expected failure with its code", () => {
    expect(err({ code: "movie_not_found" })).toEqual({
      ok: false,
      error: { code: "movie_not_found" },
    });
  });

  it("lets a caller tell success from failure by the ok flag", () => {
    expect(ok("x").ok).toBe(true);
    expect(err({ code: "invalid_cursor" }).ok).toBe(false);
  });
});

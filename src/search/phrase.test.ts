import { describe, expect, it } from "vitest";
import { checkPhrase, normalizePhrase } from "./phrase";

// Spec 0012, AC-2: trimmed, whitespace collapsed, 2 to 120 characters.
describe("normalizePhrase (AC-2)", () => {
  it("trims and collapses every run of whitespace to one space", () => {
    expect(normalizePhrase("  a \t slow\n\nthriller  ")).toBe(
      "a slow thriller",
    );
  });
});

describe("checkPhrase (AC-2)", () => {
  it("accepts a phrase and returns it normalized", () => {
    expect(checkPhrase("  something  funny ")).toEqual({
      ok: true,
      phrase: "something funny",
    });
  });

  it.each(["", "   ", "a", " a "])("refuses %j as too short", (raw) => {
    expect(checkPhrase(raw)).toEqual({ ok: false, problem: "too_short" });
  });

  it("accepts exactly 2 and exactly 120 characters", () => {
    expect(checkPhrase("ab").ok).toBe(true);
    expect(checkPhrase("x".repeat(120)).ok).toBe(true);
  });

  it("refuses 121 characters as too long", () => {
    expect(checkPhrase("x".repeat(121))).toEqual({
      ok: false,
      problem: "too_long",
    });
  });

  it("measures the length after collapsing spaces", () => {
    expect(checkPhrase(`${"x".repeat(60)}      ${"y".repeat(59)}`).ok).toBe(
      true,
    );
  });

  it("counts an emoji as one character", () => {
    expect(checkPhrase("🎬".repeat(120)).ok).toBe(true);
    expect(checkPhrase("🎬")).toEqual({ ok: false, problem: "too_short" });
  });
});

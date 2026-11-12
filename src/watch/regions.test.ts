import { describe, expect, it } from "vitest";
import {
  countryName,
  countryOptions,
  isWatchRegion,
  toWatchRegion,
  WATCH_REGIONS,
} from "./regions";

// Spec 0013, AC-5 and AC-6: which country codes count, and how the picker
// names and orders them.

describe("WATCH_REGIONS", () => {
  it("holds unique, upper case two letter codes", () => {
    expect(new Set(WATCH_REGIONS).size).toBe(WATCH_REGIONS.length);
    for (const code of WATCH_REGIONS) expect(code).toMatch(/^[A-Z]{2}$/);
  });
});

describe("toWatchRegion (AC-5)", () => {
  it.each([
    ["US", "US"],
    ["us", "US"],
    [" fr ", "FR"],
  ])("reads %j as %s", (value, expected) => {
    expect(toWatchRegion(value)).toBe(expected);
  });

  it.each(["XX", "T1", "", "USA", "A1", "??"])(
    "ignores %j, which is not a watch region",
    (value) => {
      expect(toWatchRegion(value)).toBeNull();
    },
  );

  it.each([null, undefined])("returns null for %j", (value) => {
    expect(toWatchRegion(value)).toBeNull();
  });
});

describe("isWatchRegion", () => {
  it("accepts a listed code and refuses a lower case one", () => {
    expect(isWatchRegion("DE")).toBe(true);
    expect(isWatchRegion("de")).toBe(false);
  });
});

describe("countryName (AC-6)", () => {
  it.each([
    ["FR", "France"],
    ["US", "United States"],
    ["XK", "Kosovo"],
  ])("names %s in English as %s", (code, name) => {
    expect(countryName(code)).toBe(name);
  });

  it("falls back to the code when there is no name", () => {
    expect(countryName("not a code")).toBe("not a code");
  });
});

describe("countryOptions (AC-6)", () => {
  it("lists every watch region once", () => {
    const codes = countryOptions().map((option) => option.code);
    expect([...codes].sort()).toEqual([...WATCH_REGIONS].sort());
  });

  it("sorts by English name, not by code", () => {
    const names = countryOptions().map((option) => option.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });
});

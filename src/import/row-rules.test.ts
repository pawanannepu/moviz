import { describe, expect, it } from "vitest";
import {
  cutTitle,
  evaluateRow,
  parseRatedDate,
  parseStars,
  parseYear,
  type RawRow,
} from "./row-rules";

// Spec 0009, the row rules (AC-4, AC-5). Every rule is pure: the clock comes in
// as `now`.
const NOW = new Date("2026-11-11T10:00:00Z");

const row = (overrides: Partial<RawRow> = {}): RawRow => ({
  rowNumber: 1,
  name: "Heat",
  year: "1995",
  rating: "4.5",
  date: "2024-03-02",
  ...overrides,
});

describe("parseStars (AC-1, AC-4)", () => {
  it.each([
    ["0.5", 1],
    ["1", 2],
    ["1.0", 2],
    ["3.5", 7],
    ["4.0", 8],
    ["5", 10],
    [" 2.5 ", 5],
  ])("turns %j stars into a score of %i (stars times 2)", (text, score) => {
    expect(parseStars(text)).toBe(score);
  });

  it.each([
    "",
    " ",
    "0",
    "0.0",
    "5.5",
    "6",
    "3.3",
    "3.25",
    "-1",
    "abc",
    "4,5",
    "00.5",
    "1e0",
  ])("refuses %j, which is not a half star from 0.5 to 5", (text) => {
    expect(parseStars(text)).toBeNull();
  });
});

describe("parseYear (AC-4)", () => {
  it.each([
    ["1870", 1870],
    ["1995", 1995],
    [" 1995 ", 1995],
    ["2031", 2031],
  ])("accepts %j", (text, year) => {
    expect(parseYear(text, NOW)).toBe(year);
  });

  it.each(["", "95", "19955", "abcd", "1869", "2032", "1995.0", "-1995"])(
    "refuses %j",
    (text) => {
      expect(parseYear(text, NOW)).toBeNull();
    },
  );

  it("measures the upper bound against the clock it is given, not the real one", () => {
    const earlier = new Date("2000-06-01T00:00:00Z");
    expect(parseYear("2005", earlier)).toBe(2005);
    expect(parseYear("2006", earlier)).toBeNull();
  });
});

describe("parseRatedDate (AC-5)", () => {
  it("reads a real past day as 00:00:00 UTC", () => {
    expect(parseRatedDate("2024-03-02", NOW)?.toISOString()).toBe(
      "2024-03-02T00:00:00.000Z",
    );
  });

  it("accepts today's UTC date", () => {
    expect(parseRatedDate("2026-11-11", NOW)?.toISOString()).toBe(
      "2026-11-11T00:00:00.000Z",
    );
  });

  it("refuses tomorrow, so a future date means the database now()", () => {
    expect(parseRatedDate("2026-11-12", NOW)).toBeNull();
    expect(parseRatedDate("2999-01-01", NOW)).toBeNull();
  });

  it("accepts a leap day and refuses one in a normal year", () => {
    expect(parseRatedDate("2024-02-29", NOW)).not.toBeNull();
    expect(parseRatedDate("2023-02-29", NOW)).toBeNull();
  });

  it.each([
    "",
    "2024-02-30",
    "2024-13-01",
    "2024-00-10",
    "03/02/2024",
    "2024-03-02 10:00",
    "2024-3-2",
  ])("refuses %j", (text) => {
    expect(parseRatedDate(text, NOW)).toBeNull();
  });

  it("uses the UTC day of the clock it is given, not the local day", () => {
    const justAfterMidnightUtc = new Date("2026-11-12T00:00:30Z");
    expect(parseRatedDate("2026-11-12", justAfterMidnightUtc)).not.toBeNull();
    expect(parseRatedDate("2026-11-12", NOW)).toBeNull();
  });
});

describe("cutTitle (AC-13, storage bound)", () => {
  it("leaves a title of 200 characters whole", () => {
    const title = "a".repeat(200);
    expect(cutTitle(title)).toBe(title);
  });

  it("cuts a longer title to 200 characters", () => {
    expect(cutTitle("a".repeat(500))).toHaveLength(200);
  });

  it("counts characters, not code units, so it never splits an emoji", () => {
    const cut = cutTitle(`${"a".repeat(199)}😀😀😀`);
    expect(Array.from(cut)).toHaveLength(200);
    expect(cut.isWellFormed()).toBe(true);
  });

  it("keeps an empty title empty", () => {
    expect(cutTitle("")).toBe("");
  });
});

describe("evaluateRow (AC-4)", () => {
  it("turns a good row into a valid one with a trimmed title, a score and a date", () => {
    expect(evaluateRow(row({ name: "  Heat  " }), NOW)).toEqual({
      kind: "valid",
      rowNumber: 1,
      title: "Heat",
      year: 1995,
      score: 9,
      ratedAt: new Date("2024-03-02T00:00:00Z"),
    });
  });

  it("keeps a valid row with no usable date and marks it for the database now()", () => {
    for (const date of ["", "2999-01-01", "2024-13-40"]) {
      expect(evaluateRow(row({ date }), NOW)).toMatchObject({
        kind: "valid",
        ratedAt: null,
      });
    }
  });

  it("makes a blank or whitespace title an invalid row", () => {
    for (const name of ["", "   "]) {
      expect(evaluateRow(row({ name }), NOW)).toEqual({
        kind: "invalid",
        rowNumber: 1,
        title: "",
        year: 1995,
        score: 9,
      });
    }
  });

  it("makes a bad rating an invalid row that keeps the title and year but not the score", () => {
    expect(evaluateRow(row({ rating: "3.3" }), NOW)).toEqual({
      kind: "invalid",
      rowNumber: 1,
      title: "Heat",
      year: 1995,
      score: null,
    });
  });

  it("makes a missing or bad year an invalid row with no year", () => {
    for (const year of ["", "abc", "1500"]) {
      expect(evaluateRow(row({ year }), NOW)).toMatchObject({
        kind: "invalid",
        year: null,
        score: 9,
      });
    }
  });

  it("keeps the row number it was given", () => {
    expect(evaluateRow(row({ rowNumber: 42, rating: "" }), NOW).rowNumber).toBe(
      42,
    );
  });

  it("keeps the whole title for the matcher, however long", () => {
    const long = "x".repeat(500);
    expect(evaluateRow(row({ name: long }), NOW)).toMatchObject({
      kind: "valid",
      title: long,
    });
  });
});

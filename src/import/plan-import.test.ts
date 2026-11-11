import { describe, expect, it } from "vitest";
import type { MatchOutcome } from "@/catalog/match/match-movies";
import { planImport, rowsToMatch } from "./plan-import";
import { evaluateRow, type RawRow } from "./row-rules";

// Spec 0009: turning evaluated rows and the matcher's answers into a plan
// (AC-2, AC-4). Pure.
const NOW = new Date("2026-11-11T10:00:00Z");
const raw = (n: number, over: Partial<RawRow> = {}): RawRow => ({
  rowNumber: n,
  name: `Film ${n}`,
  year: "2001",
  rating: "4",
  date: "2024-03-02",
  ...over,
});
const evaluate = (...rows: RawRow[]) => rows.map((r) => evaluateRow(r, NOW));
const match = (movieId: number): MatchOutcome => ({ kind: "match", movieId });

describe("rowsToMatch", () => {
  it("returns only the valid rows, in file order", () => {
    const rows = evaluate(raw(1), raw(2, { rating: "9" }), raw(3));
    expect(rowsToMatch(rows).map((r) => r.rowNumber)).toEqual([1, 3]);
  });
});

describe("planImport (AC-4)", () => {
  it("turns a match into a planned rating that carries the row's score, date, title and year", () => {
    const plan = planImport(evaluate(raw(1)), [match(10)]);
    expect(plan.ratings).toEqual([
      {
        rowNumber: 1,
        title: "Film 1",
        year: 2001,
        movieId: 10,
        score: 8,
        ratedAt: new Date("2024-03-02T00:00:00Z"),
      },
    ]);
    expect(plan.unmatched).toEqual([]);
    expect(plan.rowsTotal).toBe(1);
  });

  it("maps no_match and ambiguous to the reasons of the same name", () => {
    const plan = planImport(evaluate(raw(1), raw(2)), [
      { kind: "no_match" },
      { kind: "ambiguous" },
    ]);
    expect(plan.unmatched.map((u) => [u.rowNumber, u.reason])).toEqual([
      [1, "no_match"],
      [2, "ambiguous"],
    ]);
    expect(plan.ratings).toEqual([]);
  });

  it("stores an invalid row as invalid_row without sending it to the matcher", () => {
    const rows = evaluate(raw(1, { rating: "3.3" }), raw(2));
    const plan = planImport(rows, [match(5)]);
    expect(plan.unmatched).toEqual([
      {
        rowNumber: 1,
        title: "Film 1",
        year: 2001,
        score: null,
        reason: "invalid_row",
      },
    ]);
    expect(plan.ratings.map((r) => r.rowNumber)).toEqual([2]);
  });

  it("lines the matcher's answers up with the valid rows only", () => {
    const rows = evaluate(
      raw(1, { name: "" }),
      raw(2),
      raw(3, { year: "x" }),
      raw(4),
    );
    const plan = planImport(rows, [match(20), match(40)]);
    expect(plan.ratings.map((r) => [r.rowNumber, r.movieId])).toEqual([
      [2, 20],
      [4, 40],
    ]);
  });

  it("keeps the first row of a movie and calls every later one a duplicate", () => {
    const plan = planImport(evaluate(raw(1), raw(2), raw(3)), [
      match(7),
      match(7),
      match(7),
    ]);
    expect(plan.ratings.map((r) => r.rowNumber)).toEqual([1]);
    expect(plan.unmatched.map((u) => [u.rowNumber, u.reason])).toEqual([
      [2, "duplicate"],
      [3, "duplicate"],
    ]);
  });

  it("does not count an invalid row as the first row of a movie", () => {
    const rows = evaluate(raw(1, { rating: "0" }), raw(2));
    const plan = planImport(rows, [match(7)]);
    expect(plan.ratings.map((r) => r.rowNumber)).toEqual([2]);
  });

  it("makes every row exactly one rating or one unmatched row, so the counts add up (AC-2)", () => {
    const rows = evaluate(
      raw(1),
      raw(2, { rating: "x" }),
      raw(3),
      raw(4),
      raw(5),
    );
    const plan = planImport(rows, [
      match(1),
      { kind: "no_match" },
      match(1),
      { kind: "ambiguous" },
    ]);
    expect(plan.ratings.length + plan.unmatched.length).toBe(plan.rowsTotal);
    expect(plan.rowsTotal).toBe(5);
  });

  it("returns unmatched rows in file order even when reasons are mixed", () => {
    const rows = evaluate(raw(1), raw(2, { name: "" }), raw(3), raw(4));
    const plan = planImport(rows, [
      { kind: "ambiguous" },
      { kind: "no_match" },
      { kind: "no_match" },
    ]);
    expect(plan.unmatched.map((u) => u.rowNumber)).toEqual([1, 2, 3, 4]);
  });

  it("cuts a long title for storage", () => {
    const plan = planImport(evaluate(raw(1, { name: "x".repeat(400) })), [
      { kind: "no_match" },
    ]);
    expect(plan.unmatched[0].title).toHaveLength(200);
  });

  it("treats a missing answer as no_match rather than failing", () => {
    const plan = planImport(evaluate(raw(1)), []);
    expect(plan.unmatched).toMatchObject([
      { rowNumber: 1, reason: "no_match" },
    ]);
  });

  it("plans nothing for no rows", () => {
    expect(planImport([], [])).toEqual({
      rowsTotal: 0,
      ratings: [],
      unmatched: [],
    });
  });
});

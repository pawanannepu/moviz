import { describe, expect, it } from "vitest";
import {
  FILE_FIELD_HINT,
  IMPORT_ERROR_CODES,
  IMPORT_ERROR_STATUS,
  IMPORT_ERROR_TITLES,
  IMPORT_STEPS,
  importErrorBody,
  importedAnnouncement,
  REASON_LABELS,
} from "./messages";
import type { UnmatchedReason } from "./row-rules";

// Spec 0009, "Messages": every code has a status, a heading and a plain body.
describe("import messages (AC-3, AC-7, AC-9)", () => {
  it("sends each error code with the HTTP status the spec names", () => {
    expect(IMPORT_ERROR_STATUS).toEqual({
      unauthenticated: 401,
      bad_origin: 403,
      no_file: 400,
      file_too_large: 413,
      looks_like_zip: 422,
      not_letterboxd_ratings: 422,
      empty_file: 422,
      daily_limit: 429,
      db_unavailable: 503,
    });
  });

  it.each(IMPORT_ERROR_CODES)("has a heading and a body for %s", (code) => {
    expect(IMPORT_ERROR_TITLES[code].length).toBeGreaterThan(0);
    expect(importErrorBody(code).length).toBeGreaterThan(0);
  });

  it("tells a user with a rejected file what to do next", () => {
    expect(importErrorBody("no_file")).toBe(
      "Choose your ratings.csv file first.",
    );
    expect(importErrorBody("looks_like_zip")).toContain("ratings.csv");
    expect(importErrorBody("file_too_large")).toContain("2 MB");
    expect(importErrorBody("not_letterboxd_ratings")).toContain(
      "Name, Year and Rating",
    );
  });

  it("says nothing changed when the save failed", () => {
    expect(importErrorBody("db_unavailable")).toContain(
      "None of your ratings changed",
    );
  });

  it("names the number of imports and the reset time for the daily limit", () => {
    const body = importErrorBody(
      "daily_limit",
      new Date("2026-11-12T00:00:00Z"),
    );
    expect(body).toContain("5 imports");
    expect(body).toContain("Try again after");
  });

  it("falls back to tomorrow when the reset time is unknown", () => {
    expect(importErrorBody("daily_limit")).toContain("Try again tomorrow");
  });

  it("has a plain label for every reason a row can be left out", () => {
    const reasons: UnmatchedReason[] = [
      "no_match",
      "ambiguous",
      "invalid_row",
      "duplicate",
      "kept_manual",
    ];
    for (const reason of reasons)
      expect(REASON_LABELS[reason].length).toBeGreaterThan(0);
    expect(REASON_LABELS.no_match).toBe("Not in our catalog");
    expect(REASON_LABELS.kept_manual).toContain("kept your rating");
  });

  it("announces how many ratings were imported", () => {
    expect(importedAnnouncement(412, 1280)).toBe(
      "Imported 412 of 1280 ratings",
    );
  });

  it("has three export steps and a size hint", () => {
    expect(IMPORT_STEPS).toHaveLength(3);
    expect(FILE_FIELD_HINT).toContain("2 MB");
  });
});

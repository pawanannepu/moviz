import { describe, expect, it } from "vitest";
import * as constants from "./constants";

// Spec 0009 "Configuration required": every number the import uses lives in
// constants.ts. Change the spec and this test together.
describe("import constants (AC-3, AC-9, AC-10, AC-11, AC-16)", () => {
  it("pins the numbers the spec names", () => {
    expect(constants.MAX_FILE_BYTES).toBe(2_097_152);
    expect(constants.MAX_IMPORTS_PER_DAY).toBe(5);
    expect(constants.KEEP_IMPORTS).toBe(5);
    expect(constants.CHUNK_SIZE).toBe(1000);
    expect(constants.UNMATCHED_PAGE_SIZE).toBe(50);
    expect(constants.TITLE_MAX_CHARS).toBe(200);
    expect(constants.SAVE_BUDGET_MS).toBe(45_000);
    expect(constants.STATEMENT_TIMEOUT_MS).toBe(20_000);
    expect(constants.MIN_FILM_YEAR).toBe(1870);
    expect(constants.FILM_YEARS_AHEAD).toBe(5);
  });

  it("keeps the save budget under Vercel's 60 second function limit", () => {
    expect(constants.SAVE_BUDGET_MS).toBeLessThan(60_000);
    expect(constants.STATEMENT_TIMEOUT_MS).toBeLessThan(
      constants.SAVE_BUDGET_MS,
    );
  });

  it("keeps a day's imports within what the user keeps", () => {
    expect(constants.MAX_IMPORTS_PER_DAY).toBeLessThanOrEqual(
      constants.KEEP_IMPORTS,
    );
  });

  it("names the page and the endpoint", () => {
    expect(constants.IMPORT_PATH).toBe("/import");
    expect(constants.IMPORT_API_PATH).toBe("/api/import/letterboxd");
  });
});

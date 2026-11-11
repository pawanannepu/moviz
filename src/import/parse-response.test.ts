import { describe, expect, it } from "vitest";
import { IMPORT_ERROR_CODES } from "./messages";
import { parseImportAnswer } from "./parse-response";

// Spec 0009, AC-3 and AC-7: what the browser makes of each answer, including
// answers that are not ours.
describe("parseImportAnswer (AC-3, AC-7, AC-9)", () => {
  it("reads a good answer into the counts the status line needs", () => {
    expect(
      parseImportAnswer(200, {
        ok: true,
        importId: 3,
        rowsTotal: 15,
        rowsMatched: 12,
        rowsUnmatched: 3,
        onboarded: true,
      }),
    ).toEqual({ kind: "success", matched: 12, total: 15 });
  });

  it.each(IMPORT_ERROR_CODES)("reads the error code %s", (code) => {
    expect(parseImportAnswer(422, { ok: false, error: code })).toEqual({
      kind: "error",
      code,
    });
  });

  it("reads the reset time of the daily limit as a date", () => {
    const answer = parseImportAnswer(429, {
      ok: false,
      error: "daily_limit",
      resetAt: "2026-11-12T00:00:00.000Z",
    });
    expect(answer).toEqual({
      kind: "error",
      code: "daily_limit",
      resetAt: new Date("2026-11-12T00:00:00.000Z"),
    });
  });

  it("drops a reset time that is not a date", () => {
    expect(
      parseImportAnswer(429, {
        ok: false,
        error: "daily_limit",
        resetAt: "soon",
      }),
    ).toEqual({ kind: "error", code: "daily_limit" });
  });

  it("maps Vercel's own 413 for an oversize body to file_too_large", () => {
    expect(parseImportAnswer(413, null)).toEqual({
      kind: "error",
      code: "file_too_large",
    });
  });

  it("maps a 401 that is not our JSON, like the route guard's, to unauthenticated", () => {
    expect(parseImportAnswer(401, { error: "unauthenticated" })).toEqual({
      kind: "error",
      code: "unauthenticated",
    });
  });

  it.each([
    [504, null],
    [500, null],
    [502, "<html>bad gateway</html>"],
    [200, { ok: true }],
    [200, { ok: true, rowsMatched: -1, rowsTotal: 3 }],
    [200, { ok: true, rowsMatched: 1.5, rowsTotal: 3 }],
    [400, { ok: false, error: "something_new" }],
    [422, []],
  ])(
    "maps an unrecognised answer (%i, %j) to db_unavailable",
    (status, body) => {
      expect(parseImportAnswer(status, body)).toEqual({
        kind: "error",
        code: "db_unavailable",
      });
    },
  );
});

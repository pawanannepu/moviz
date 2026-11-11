import { describe, expect, it } from "vitest";
import {
  decodeUnmatchedCursor,
  encodeUnmatchedCursor,
} from "./unmatched-cursor";

// Spec 0009, AC-11: the opaque cursor of the not matched list.
describe("unmatched cursor (AC-11)", () => {
  it("reads back the row number it was made from", () => {
    for (const row of [1, 50, 12_345]) {
      expect(decodeUnmatchedCursor(encodeUnmatchedCursor(row))).toEqual({
        ok: true,
        value: row,
      });
    }
  });

  it("is URL safe text that does not show the row number", () => {
    const cursor = encodeUnmatchedCursor(50);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cursor).not.toBe("50");
  });

  it.each([
    ["garbage", "garbage"],
    ["empty", ""],
    ["a number", Buffer.from("50").toString("base64url")],
    ["json without r", Buffer.from('{"x":1}').toString("base64url")],
    ["a negative row", Buffer.from('{"r":-3}').toString("base64url")],
    ["zero", Buffer.from('{"r":0}').toString("base64url")],
    ["a fraction", Buffer.from('{"r":1.5}').toString("base64url")],
    ["text for r", Buffer.from('{"r":"7"}').toString("base64url")],
    ["not json", Buffer.from("not json").toString("base64url")],
  ])("refuses %s as invalid_cursor", (_label, cursor) => {
    expect(decodeUnmatchedCursor(cursor)).toEqual({
      ok: false,
      error: { code: "invalid_cursor" },
    });
  });
});

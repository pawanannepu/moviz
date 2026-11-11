import { describe, expect, it } from "vitest";
import { moviePath, parseMovieId } from "./movie-path";

// Spec 0010: the address of a movie page, and the strict check of its `id`
// segment (AC-2). Both are pure.

describe("moviePath (AC-12)", () => {
  it("builds /movie/{id}", () => {
    expect(moviePath(412)).toBe("/movie/412");
  });

  it("round trips through parseMovieId", () => {
    expect(parseMovieId(moviePath(7).slice("/movie/".length))).toBe(7);
  });
});

describe("parseMovieId (AC-2)", () => {
  it.each([
    ["1", 1],
    ["9", 9],
    ["412", 412],
    ["1000000", 1_000_000],
    ["999999999999999", 999_999_999_999_999],
  ])("reads %s as a movie id", (segment, id) => {
    expect(parseMovieId(segment)).toBe(id);
  });

  it("only ever returns a safe whole number", () => {
    const id = parseMovieId("999999999999999");

    expect(Number.isSafeInteger(id)).toBe(true);
  });

  it.each([
    ["zero", "0"],
    ["a leading zero", "012"],
    ["only zeros", "000"],
    ["a letter after digits", "12a"],
    ["letters", "abc"],
    ["a decimal", "1.5"],
    ["a negative number", "-3"],
    ["a plus sign", "+3"],
    ["an empty segment", ""],
    ["a space", " 12"],
    ["a trailing space", "12 "],
    ["a trailing newline", "12\n"],
    ["exponent form", "1e3"],
    ["hex form", "0x1F"],
    ["16 digits", "1234567890123456"],
    ["a url encoded slash", "12%2F3"],
    ["digits from another script", "１２"],
    ["the word Infinity", "Infinity"],
  ])("rejects %s", (_name, segment) => {
    expect(parseMovieId(segment)).toBeNull();
  });
});

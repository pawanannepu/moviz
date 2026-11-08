import { describe, expect, it } from "vitest";
import { chooseMatch, type MatchCandidate } from "./choose-match";

const candidate = (
  movieId: number,
  releaseYear: number,
  kind: MatchCandidate["kind"] = "primary",
): MatchCandidate => ({ movieId, releaseYear, kind });

describe("chooseMatch (AC-4)", () => {
  it("returns no_match when there are no candidates", () => {
    expect(chooseMatch(1995, [])).toEqual({ kind: "no_match" });
  });

  it("matches a single movie in the same year", () => {
    expect(chooseMatch(1995, [candidate(1, 1995)])).toEqual({
      kind: "match",
      movieId: 1,
    });
  });

  it("accepts a movie one year before or one year after", () => {
    expect(chooseMatch(1995, [candidate(1, 1994)])).toEqual({
      kind: "match",
      movieId: 1,
    });
    expect(chooseMatch(1995, [candidate(2, 1996)])).toEqual({
      kind: "match",
      movieId: 2,
    });
  });

  it("refuses a movie two years away", () => {
    expect(chooseMatch(1995, [candidate(1, 1997), candidate(2, 1993)])).toEqual(
      { kind: "no_match" },
    );
  });

  it("prefers the exact year over a one year difference", () => {
    expect(chooseMatch(1995, [candidate(1, 1996), candidate(2, 1995)])).toEqual(
      { kind: "match", movieId: 2 },
    );
  });

  it("prefers a primary or original title over an alternate one", () => {
    expect(
      chooseMatch(1995, [
        candidate(1, 1995, "alternate"),
        candidate(2, 1995, "original"),
      ]),
    ).toEqual({ kind: "match", movieId: 2 });
    expect(
      chooseMatch(1995, [
        candidate(1, 1995, "primary"),
        candidate(2, 1995, "alternate"),
      ]),
    ).toEqual({ kind: "match", movieId: 1 });
  });

  it("applies the year rule before the title kind rule", () => {
    // The exact year movie only matches by an alternate title, and still wins.
    expect(
      chooseMatch(1995, [
        candidate(1, 1996, "primary"),
        candidate(2, 1995, "alternate"),
      ]),
    ).toEqual({ kind: "match", movieId: 2 });
  });

  it("is ambiguous when two movies tie on year and title kind", () => {
    expect(chooseMatch(1995, [candidate(1, 1995), candidate(2, 1995)])).toEqual(
      { kind: "ambiguous" },
    );
    expect(
      chooseMatch(1995, [
        candidate(1, 1995, "alternate"),
        candidate(2, 1995, "alternate"),
      ]),
    ).toEqual({ kind: "ambiguous" });
  });

  it("is ambiguous when two movies tie one year off with no exact match", () => {
    expect(chooseMatch(1995, [candidate(1, 1994), candidate(2, 1996)])).toEqual(
      { kind: "ambiguous" },
    );
  });
});

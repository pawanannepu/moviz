import { describe, expect, it } from "vitest";
import { CAST_LIMIT } from "./constants";
import {
  castLines,
  detailMeta,
  directorLine,
  directorNames,
  formatRuntime,
  moviePageTitle,
} from "./format";

// Spec 0010: the words on the movie detail page. Every function here is pure.

describe("formatRuntime (AC-5)", () => {
  it.each([
    [170, "2h 50m"],
    [120, "2h"],
    [45, "45m"],
    [60, "1h"],
    [61, "1h 1m"],
    [59, "59m"],
    [1, "1m"],
    [600, "10h"],
    [873, "14h 33m"],
  ])("words %i minutes as %s", (minutes, text) => {
    expect(formatRuntime(minutes)).toBe(text);
  });

  it.each([
    ["null", null],
    ["zero", 0],
    ["a negative number", -90],
    ["not a number", Number.NaN],
  ])("gives nothing for %s", (_name, minutes) => {
    expect(formatRuntime(minutes)).toBeNull();
  });
});

describe("detailMeta (AC-5)", () => {
  it("joins the year, the runtime and every genre with a comma", () => {
    expect(
      detailMeta({
        releaseYear: 1995,
        runtimeMinutes: 170,
        genres: ["Crime", "Drama"],
      }),
    ).toBe("1995, 2h 50m, Crime, Drama");
  });

  it("lists every genre, not only the first two, in the order given", () => {
    expect(
      detailMeta({
        releaseYear: 1995,
        runtimeMinutes: 120,
        genres: ["Action", "Crime", "Drama", "Thriller"],
      }),
    ).toBe("1995, 2h, Action, Crime, Drama, Thriller");
  });

  it("drops a null year", () => {
    expect(
      detailMeta({ releaseYear: null, runtimeMinutes: 45, genres: ["Crime"] }),
    ).toBe("45m, Crime");
  });

  it.each([
    ["null", null],
    ["zero", 0],
    ["negative", -5],
  ])("drops a %s runtime", (_name, runtimeMinutes) => {
    expect(
      detailMeta({ releaseYear: 1995, runtimeMinutes, genres: ["Crime"] }),
    ).toBe("1995, Crime");
  });

  it("drops an empty genre list", () => {
    expect(
      detailMeta({ releaseYear: 1995, runtimeMinutes: 170, genres: [] }),
    ).toBe("1995, 2h 50m");
  });

  it("is empty when there is nothing to show", () => {
    expect(
      detailMeta({ releaseYear: null, runtimeMinutes: null, genres: [] }),
    ).toBe("");
  });
});

describe("directorNames and directorLine (AC-6)", () => {
  const named = (...names: string[]) => names.map((name) => ({ name }));

  it("shows one director alone", () => {
    expect(directorNames(named("Michael Mann"))).toBe("Michael Mann");
  });

  it("joins two directors with and", () => {
    expect(directorNames(named("Lana Wachowski", "Lilly Wachowski"))).toBe(
      "Lana Wachowski and Lilly Wachowski",
    );
  });

  it("joins three directors with commas and a final and", () => {
    expect(directorNames(named("A", "B", "C"))).toBe("A, B, and C");
  });

  it("keeps the billing order it was given", () => {
    expect(directorNames(named("Zed", "Abe"))).toBe("Zed and Abe");
  });

  it("gives nothing when there is no director", () => {
    expect(directorNames([])).toBeNull();
    expect(directorLine([])).toBeNull();
  });

  it("words the whole line as Directed by {names}", () => {
    expect(directorLine(named("Michael Mann"))).toBe(
      "Directed by Michael Mann",
    );
    expect(directorLine(named("A", "B", "C"))).toBe("Directed by A, B, and C");
  });
});

describe("castLines (AC-6)", () => {
  const member = (personId: number, characterName: string | null = "Role") => ({
    personId,
    name: `Actor ${personId}`,
    characterName,
  });

  it("limits the cast to 8", () => {
    expect(CAST_LIMIT).toBe(8);
  });

  it("keeps the first 8 of 20 in billing order", () => {
    const cast = Array.from({ length: 20 }, (_, index) => member(index + 1));

    const lines = castLines(cast);

    expect(lines.map((line) => line.personId)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it("keeps a short cast whole", () => {
    expect(castLines([member(3), member(1)])).toEqual([
      { personId: 3, name: "Actor 3", character: "Role" },
      { personId: 1, name: "Actor 1", character: "Role" },
    ]);
  });

  it.each([
    ["null", null],
    ["empty", ""],
    ["only spaces", "   "],
  ])("has no character when the character name is %s", (_name, character) => {
    expect(castLines([member(1, character)])[0].character).toBeNull();
  });

  it("trims spaces around a character name", () => {
    expect(castLines([member(1, "  Vincent Hanna ")])[0].character).toBe(
      "Vincent Hanna",
    );
  });

  it("gives an empty list for no cast", () => {
    expect(castLines([])).toEqual([]);
  });

  it("does not change the list it was given", () => {
    const cast = Array.from({ length: 10 }, (_, index) => member(index + 1));

    castLines(cast);

    expect(cast).toHaveLength(10);
  });
});

describe("moviePageTitle (AC-19)", () => {
  it("words the title as {title} ({year}) · Moviz", () => {
    expect(moviePageTitle({ title: "Heat", releaseYear: 1995 })).toBe(
      "Heat (1995) · Moviz",
    );
  });

  it("leaves the year and its parentheses out when the year is null", () => {
    expect(moviePageTitle({ title: "Heat", releaseYear: null })).toBe(
      "Heat · Moviz",
    );
  });

  it("keeps a title that has its own parentheses as it is", () => {
    expect(
      moviePageTitle({ title: "Birdman (or The Virtue)", releaseYear: 2014 }),
    ).toBe("Birdman (or The Virtue) (2014) · Moviz");
  });
});

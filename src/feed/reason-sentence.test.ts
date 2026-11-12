import { describe, expect, it } from "vitest";
import type { Reason } from "@/recommend/types";
import { reasonSentence } from "./reason-sentence";

/** A `similar_to_liked` reason whose anchor the user rated `score`. */
function similar(
  score: number,
  overrides: { title?: string; releaseYear?: number | null } = {},
): Reason {
  return {
    kind: "similar_to_liked",
    anchor: {
      movieId: 1,
      title: overrides.title ?? "Heat",
      releaseYear:
        overrides.releaseYear === undefined ? 1995 : overrides.releaseYear,
      score,
    },
  };
}

describe("reasonSentence verb (AC-3)", () => {
  it.each([
    [10, "loved"],
    [9, "loved"],
    [8, "liked"],
    [7, "liked"],
    [6, "rated"],
  ])("uses the verb for an anchor score of %i", (score, verb) => {
    expect(reasonSentence(similar(score))).toBe(
      `Because you ${verb} Heat (1995)`,
    );
  });

  it("never claims more than a mild score supports", () => {
    expect(reasonSentence(similar(6))).not.toMatch(/loved|liked/);
  });
});

describe("reasonSentence shape (AC-3)", () => {
  it("leaves out the year and its parentheses when the year is null", () => {
    expect(reasonSentence(similar(9, { releaseYear: null }))).toBe(
      "Because you loved Heat",
    );
  });

  it("keeps a year of 0 out of the way of the null check", () => {
    expect(reasonSentence(similar(9, { releaseYear: 0 }))).toBe(
      "Because you loved Heat (0)",
    );
  });

  it("has no full stop at the end", () => {
    expect(reasonSentence(similar(9)).endsWith(".")).toBe(false);
    expect(reasonSentence({ kind: "popular" }).endsWith(".")).toBe(false);
  });

  it("keeps the whole title, including punctuation and unicode", () => {
    const title = "Amélie: Le Fabuleux Destin (d'Amélie Poulain) — 🎬";
    expect(reasonSentence(similar(8, { title }))).toBe(
      `Because you liked ${title} (1995)`,
    );
  });

  it("does not cut a very long title short", () => {
    const title = "A".repeat(200);
    expect(reasonSentence(similar(9, { title }))).toContain(title);
  });

  it("says a popular pick is popular with film fans", () => {
    expect(reasonSentence({ kind: "popular" })).toBe("Popular with film fans");
  });

  it("is never empty", () => {
    expect(reasonSentence(similar(6, { title: "" })).length).toBeGreaterThan(0);
    expect(reasonSentence({ kind: "popular" }).length).toBeGreaterThan(0);
  });

  describe("more like this (spec 0011, AC-8)", () => {
    const asked = (releaseYear: number | null) =>
      ({
        kind: "more_like_this",
        anchor: { movieId: 900, title: "Heat", releaseYear },
      }) as const;

    it("says the pick is more like the movie the user asked for", () => {
      expect(reasonSentence(asked(1995))).toBe(
        "More like Heat (1995), as you asked",
      );
    });

    it("leaves the year and its parentheses out when the year is null", () => {
      expect(reasonSentence(asked(null))).toBe("More like Heat, as you asked");
    });

    it("has no full stop", () => {
      expect(reasonSentence(asked(1995)).endsWith(".")).toBe(false);
    });
  });
});

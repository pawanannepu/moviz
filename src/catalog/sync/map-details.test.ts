import { describe, expect, it } from "vitest";
import fixture from "@/catalog/tmdb/__fixtures__/movie-949.json";
import {
  type TmdbMovieDetails,
  tmdbMovieDetailsSchema,
} from "@/catalog/tmdb/schemas";
import { MAX_CAST, mapDetails } from "./map-details";

const parse = (value: unknown): TmdbMovieDetails =>
  tmdbMovieDetailsSchema.parse(value);
const base = fixture as Record<string, unknown>;

describe("mapDetails", () => {
  describe("titles (AC-3)", () => {
    it("puts the primary title first and drops duplicates and empty keys", () => {
      const mapped = mapDetails(parse(base));

      expect(mapped.title).toBe("Heat");
      expect(mapped.titles[0]).toEqual({
        titleNormalized: "heat",
        kind: "primary",
      });
      // "HEAT" repeats the primary key and "!!!" has an empty key.
      expect(mapped.titles.map((row) => row.titleNormalized)).toEqual([
        "heat",
        "heat fixture german title",
      ]);
      expect(mapped.titles.map((row) => row.kind)).toEqual([
        "primary",
        "alternate",
      ]);
    });

    it("adds an original row when the original title differs", () => {
      const mapped = mapDetails(
        parse({ ...base, original_title: "Hitze", alternative_titles: null }),
      );

      expect(mapped.titles).toEqual([
        { titleNormalized: "heat", kind: "primary" },
        { titleNormalized: "hitze", kind: "original" },
      ]);
    });

    it("lets the first kind win when an alternate repeats the original key", () => {
      const mapped = mapDetails(
        parse({
          ...base,
          original_title: "Hitze",
          alternative_titles: { titles: [{ title: "HITZE" }] },
        }),
      );

      expect(
        mapped.titles.filter((r) => r.titleNormalized === "hitze"),
      ).toEqual([{ titleNormalized: "hitze", kind: "original" }]);
    });

    it("falls back to the original title when the primary key is empty", () => {
      const mapped = mapDetails(
        parse({ ...base, title: "???", original_title: "Hitze" }),
      );

      expect(mapped.title).toBe("Hitze");
      expect(mapped.titleNormalized).toBe("hitze");
      expect(mapped.titles[0]).toEqual({
        titleNormalized: "hitze",
        kind: "primary",
      });
      expect(mapped.titles.some((row) => row.kind === "original")).toBe(false);
    });

    it("gives an empty title and no title rows when every title is empty", () => {
      const mapped = mapDetails(
        parse({ ...base, title: "", original_title: "!!!" }),
      );

      expect(mapped.title).toBe("");
      expect(mapped.titles).toEqual([]);
    });
  });

  describe("empty values (AC-19)", () => {
    it("stores blank text as null", () => {
      const mapped = mapDetails(
        parse({
          ...base,
          overview: "   ",
          tagline: "",
          poster_path: "",
          release_date: "",
          original_language: "",
        }),
      );

      expect(mapped.overview).toBeNull();
      expect(mapped.tagline).toBeNull();
      expect(mapped.posterPath).toBeNull();
      expect(mapped.releaseDate).toBeNull();
      expect(mapped.originalLanguage).toBeNull();
    });

    it("stores missing numbers as null and a missing adult flag as false", () => {
      const mapped = mapDetails(
        parse({
          id: 5,
          title: "Plain",
          runtime: null,
          vote_count: null,
          popularity: null,
        }),
      );

      expect(mapped.adult).toBe(false);
      expect(mapped.runtimeMinutes).toBeNull();
      expect(mapped.voteCount).toBeNull();
      expect(mapped.popularity).toBeNull();
      expect(mapped.genres).toEqual([]);
      expect(mapped.credits).toEqual([]);
    });

    it("sorts genre names by code point and removes duplicates", () => {
      const mapped = mapDetails(
        parse({
          ...base,
          genres: [
            { id: 1, name: "Drama" },
            { id: 2, name: "Action" },
            { id: 3, name: "Drama" },
            { id: 4, name: "" },
          ],
        }),
      );

      expect(mapped.genres).toEqual(["Action", "Drama"]);
    });
  });

  describe("credits (AC-18)", () => {
    it("merges a person listed twice into one credit with the lowest order", () => {
      const mapped = mapDetails(parse(base));
      const actor = mapped.credits.filter(
        (credit) => credit.tmdbPersonId === 1001 && credit.role === "cast",
      );

      expect(actor).toHaveLength(1);
      expect(actor[0].billingOrder).toBe(0);
      expect(actor[0].characterName).toBe("Lead Thief / Night Voice");
    });

    it("stores a blank character as null", () => {
      const mapped = mapDetails(parse(base));
      const third = mapped.credits.find((c) => c.tmdbPersonId === 1003);

      expect(third?.characterName).toBeNull();
    });

    it("takes directors only from crew with the job Director", () => {
      const mapped = mapDetails(parse(base));
      const directors = mapped.credits.filter((c) => c.role === "director");

      expect(directors.map((credit) => credit.name)).toEqual([
        "Fixture Director",
      ]);
    });

    it("keeps only the top cast by billing order", () => {
      const cast = Array.from({ length: MAX_CAST + 5 }, (_, index) => ({
        id: 5000 + index,
        name: `Actor ${index}`,
        character: `Role ${index}`,
        // Listed in reverse, so the cut has to sort by order first.
        order: MAX_CAST + 4 - index,
        profile_path: null,
      }));
      const mapped = mapDetails(
        parse({ ...base, credits: { cast, crew: [] } }),
      );
      const kept = mapped.credits.filter((credit) => credit.role === "cast");

      expect(kept).toHaveLength(MAX_CAST);
      expect(Math.max(...kept.map((credit) => credit.billingOrder))).toBe(
        MAX_CAST - 1,
      );
    });

    it("skips a cast member with no name", () => {
      const mapped = mapDetails(
        parse({
          ...base,
          credits: {
            cast: [{ id: 1, name: " ", order: 0 }],
            crew: [],
          },
        }),
      );

      expect(mapped.credits).toEqual([]);
    });
  });
});

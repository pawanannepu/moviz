import { describe, expect, it } from "vitest";
import fixture from "@/catalog/tmdb/__fixtures__/movie-949.json";
import { tmdbMovieDetailsSchema } from "@/catalog/tmdb/schemas";
import { isEligible, MIN_VOTES } from "./eligibility";
import { mapDetails } from "./map-details";

const TODAY = "2026-11-08";
const movie = (overrides: Record<string, unknown> = {}) =>
  mapDetails(tmdbMovieDetailsSchema.parse({ ...fixture, ...overrides }));

describe("isEligible (AC-1, AC-3)", () => {
  it("accepts a movie that passes every rule", () => {
    expect(isEligible(movie(), TODAY)).toEqual({ eligible: true });
  });

  it("rejects an adult movie", () => {
    expect(isEligible(movie({ adult: true }), TODAY)).toEqual({
      eligible: false,
      reason: "adult",
    });
  });

  it("rejects a movie with no usable title", () => {
    expect(
      isEligible(movie({ title: "", original_title: "!!!" }), TODAY),
    ).toEqual({ eligible: false, reason: "empty_title" });
  });

  it("rejects a movie with no poster", () => {
    expect(isEligible(movie({ poster_path: null }), TODAY)).toEqual({
      eligible: false,
      reason: "no_poster",
    });
  });

  it("rejects a movie whose overview is blank", () => {
    expect(isEligible(movie({ overview: "  " }), TODAY)).toEqual({
      eligible: false,
      reason: "no_overview",
    });
  });

  it("rejects a movie with no release date, as it can be neither shown nor matched", () => {
    expect(isEligible(movie({ release_date: "" }), TODAY)).toEqual({
      eligible: false,
      reason: "future_date",
    });
  });

  it("accepts a movie released today and rejects one released tomorrow", () => {
    expect(isEligible(movie({ release_date: TODAY }), TODAY)).toEqual({
      eligible: true,
    });
    expect(isEligible(movie({ release_date: "2026-11-09" }), TODAY)).toEqual({
      eligible: false,
      reason: "future_date",
    });
  });

  it("accepts exactly the minimum votes and rejects one fewer", () => {
    expect(isEligible(movie({ vote_count: MIN_VOTES }), TODAY)).toEqual({
      eligible: true,
    });
    expect(isEligible(movie({ vote_count: MIN_VOTES - 1 }), TODAY)).toEqual({
      eligible: false,
      reason: "low_votes",
    });
  });

  it("treats a missing vote count as no votes", () => {
    expect(isEligible(movie({ vote_count: null }), TODAY)).toEqual({
      eligible: false,
      reason: "low_votes",
    });
  });

  it("reports the first rule that fails when several fail", () => {
    const failing = movie({
      adult: true,
      poster_path: null,
      vote_count: 1,
    });

    expect(isEligible(failing, TODAY)).toEqual({
      eligible: false,
      reason: "adult",
    });
  });
});

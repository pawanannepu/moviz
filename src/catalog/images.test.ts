import { describe, expect, it } from "vitest";
import {
  POSTER_DIMENSIONS,
  type PosterSize,
  posterUrl,
  providerLogoUrl,
} from "./images";

describe("posterUrl (AC-13)", () => {
  it.each([
    ["w185", "https://image.tmdb.org/t/p/w185/abc.jpg"],
    ["w342", "https://image.tmdb.org/t/p/w342/abc.jpg"],
    ["w500", "https://image.tmdb.org/t/p/w500/abc.jpg"],
  ] as const)("builds the %s address from a stored path", (size, expected) => {
    expect(posterUrl("/abc.jpg", size)).toBe(expected);
  });

  it("returns null for a null path", () => {
    expect(posterUrl(null, "w342")).toBeNull();
  });

  it("adds the leading slash a stored path may lack", () => {
    expect(posterUrl("abc.jpg", "w185")).toBe(
      "https://image.tmdb.org/t/p/w185/abc.jpg",
    );
  });
});

describe("POSTER_DIMENSIONS (AC-13)", () => {
  it("names a width and height for each size, in a 2:3 ratio", () => {
    for (const size of ["w185", "w342", "w500"] as PosterSize[]) {
      const { width, height } = POSTER_DIMENSIONS[size];

      expect(width).toBe(Number(size.slice(1)));
      expect(Math.abs(height / width - 1.5)).toBeLessThan(0.01);
    }
  });
});

describe("providerLogoUrl (spec 0013, AC-2)", () => {
  it("builds the w92 address from a stored logo path", () => {
    expect(providerLogoUrl("/netflix.jpg")).toBe(
      "https://image.tmdb.org/t/p/w92/netflix.jpg",
    );
  });

  it("adds the leading slash when the stored path has none", () => {
    expect(providerLogoUrl("netflix.jpg")).toBe(
      "https://image.tmdb.org/t/p/w92/netflix.jpg",
    );
  });

  it.each([null, "", "   "])("returns null for a missing logo (%j)", (path) => {
    expect(providerLogoUrl(path)).toBeNull();
  });
});

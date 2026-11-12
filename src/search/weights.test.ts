import { describe, expect, it } from "vitest";
import * as rules from "./rules";
import * as weights from "./weights";

// Spec 0012, Key invariants: every tuning number lives in `rules.ts` or
// `weights.ts` and is pinned here. Change the spec and this test together.
describe("bite search tuning numbers", () => {
  it("pins the scoring and timing numbers (AC-6, AC-7, AC-8, AC-10)", () => {
    expect({ ...weights }).toEqual({
      BITE_RESULTS: 8,
      BITE_TASTE_WEIGHT: 0.25,
      BITE_ANCHOR_MIN_SIMILARITY: 0.5,
      SEARCH_TIME_BUDGET_MS: 8_000,
      VOYAGE_QUERY_TIMEOUT_MS: 5_000,
    });
  });

  it("pins the word rule numbers (AC-4)", () => {
    expect({ ...rules }).toEqual({
      SHORT_MAX_MINUTES: 100,
      LONG_MIN_MINUTES: 150,
      OLD_BEFORE_YEAR: 1980,
      RECENT_YEARS: 3,
      FIRST_DECADE: 1920,
      LAST_DECADE: 2020,
    });
  });

  it("gives Voyage less time than the whole budget", () => {
    expect(weights.VOYAGE_QUERY_TIMEOUT_MS).toBeLessThan(
      weights.SEARCH_TIME_BUDGET_MS,
    );
  });
});

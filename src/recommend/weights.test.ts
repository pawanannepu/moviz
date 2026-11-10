import { describe, expect, it } from "vitest";
import * as weights from "./weights";

/**
 * A golden test for the tuning numbers in spec 0007. A change here is a
 * deliberate retune: update the spec and this test together, so the change is
 * visible in review.
 */
describe("recommender constants", () => {
  it("match the values written in spec 0007", () => {
    expect({ ...weights }).toEqual({
      RATING_MIDPOINT: 5.5,
      RATING_SPAN: 4.5,
      NEGATIVE_WEIGHT: 0.5,
      PRIOR_WEIGHT: 0.1,
      PRIOR_FULL_VOTES: 5000,
      LIKED_ANCHORS: 30,
      DISLIKED_ANCHORS: 10,
      THIN_BELOW: 5,
      MIN_VARIETY_CAP: 3,
      CANDIDATE_FETCH: 300,
      DEFAULT_LIMIT: 20,
      MAX_LIMIT: 50,
      MAX_SHOWN: 500,
    });
  });

  it("AC-10: keeps the popularity nudge small enough to never reverse a larger taste gap", () => {
    expect(weights.PRIOR_WEIGHT).toBeLessThanOrEqual(0.1);
  });

  it("AC-1: lets the default limit sit inside the allowed range", () => {
    expect(weights.DEFAULT_LIMIT).toBeGreaterThanOrEqual(1);
    expect(weights.DEFAULT_LIMIT).toBeLessThanOrEqual(weights.MAX_LIMIT);
  });
});

import { describe, expect, it } from "vitest";
import { DISLIKED_SCORE, LIKED_SCORE, swipeScore } from "./swipe-score";

describe("swipeScore", () => {
  it("maps liked to 8 and disliked to 2 (AC-4)", () => {
    expect(swipeScore("liked")).toBe(8);
    expect(swipeScore("disliked")).toBe(2);
  });

  it("uses the exported constants", () => {
    expect(LIKED_SCORE).toBe(swipeScore("liked"));
    expect(DISLIKED_SCORE).toBe(swipeScore("disliked"));
  });

  it("stays inside the 1 to 10 range the rating check allows", () => {
    for (const choice of ["liked", "disliked"] as const) {
      const score = swipeScore(choice);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(1);
      expect(score).toBeLessThanOrEqual(10);
    }
  });

  it("scores a like higher than a dislike", () => {
    expect(LIKED_SCORE).toBeGreaterThan(DISLIKED_SCORE);
  });
});

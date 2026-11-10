import { describe, expect, it } from "vitest";
import {
  isLikedScore,
  pickWithVariety,
  type Ranked,
  ratingWeight,
  tasteStrength,
  varietyCap,
} from "./rules";

describe("ratingWeight", () => {
  it("AC-4: gives +1 for a 10 and -1 for a 1", () => {
    expect(ratingWeight(10)).toBe(1);
    expect(ratingWeight(1)).toBe(-1);
  });

  it("AC-4: gives about +0.56 for a swipe like (8) and -0.78 for a swipe dislike (2)", () => {
    expect(ratingWeight(8)).toBeCloseTo(0.5556, 4);
    expect(ratingWeight(2)).toBeCloseTo(-0.7778, 4);
  });

  it("AC-4: is positive from 6 up and negative from 5 down, never zero", () => {
    for (let score = 1; score <= 10; score++) {
      const weight = ratingWeight(score);
      expect(weight).not.toBe(0);
      expect(weight > 0).toBe(score >= 6);
    }
  });

  it("AC-4: is strictly increasing with the score", () => {
    for (let score = 1; score < 10; score++) {
      expect(ratingWeight(score + 1)).toBeGreaterThan(ratingWeight(score));
    }
  });
});

describe("isLikedScore", () => {
  it("AC-4: treats 6 and more as liked and 5 and less as disliked", () => {
    expect(isLikedScore(6)).toBe(true);
    expect(isLikedScore(10)).toBe(true);
    expect(isLikedScore(5)).toBe(false);
    expect(isLikedScore(1)).toBe(false);
  });
});

describe("tasteStrength", () => {
  it("AC-7: is none with no liked movie", () => {
    expect(tasteStrength(0)).toBe("none");
  });

  it("AC-7: treats a negative count like none", () => {
    expect(tasteStrength(-3)).toBe("none");
  });

  it("AC-7: is thin with 1 to 4 liked movies", () => {
    expect(tasteStrength(1)).toBe("thin");
    expect(tasteStrength(4)).toBe("thin");
  });

  it("AC-7: is ok from 5 liked movies up", () => {
    expect(tasteStrength(5)).toBe("ok");
    expect(tasteStrength(30)).toBe("ok");
    expect(tasteStrength(500)).toBe("ok");
  });
});

describe("varietyCap", () => {
  it("AC-11: is 3 for limit 20 and 7 liked anchors", () => {
    expect(varietyCap(20, 7)).toBe(3);
  });

  it("AC-11: is 10 for limit 20 and 2 liked anchors", () => {
    expect(varietyCap(20, 2)).toBe(10);
  });

  it("AC-11: is the whole limit with 1 liked anchor", () => {
    expect(varietyCap(20, 1)).toBe(20);
  });

  it("AC-11: never goes below 3, even with 30 anchors and a small limit", () => {
    expect(varietyCap(20, 30)).toBe(3);
    expect(varietyCap(1, 1)).toBe(3);
  });

  it("AC-11: rounds up", () => {
    expect(varietyCap(50, 4)).toBe(13);
  });

  it("AC-11: has no cap to speak of with no liked anchors", () => {
    expect(varietyCap(20, 0)).toBe(20);
  });
});

const candidate = (
  movieId: number,
  anchorId: number,
  score: number,
): Ranked => ({ movieId, anchorId, score });

describe("pickWithVariety", () => {
  it("AC-11: keeps one anchor to the cap while other candidates remain", () => {
    const ranked = [
      candidate(1, 100, 0.9),
      candidate(2, 100, 0.89),
      candidate(3, 100, 0.88),
      candidate(4, 100, 0.87),
      candidate(5, 200, 0.5),
      candidate(6, 300, 0.4),
    ];

    const picked = pickWithVariety(ranked, 4, 2);

    expect(picked.map((c) => c.movieId)).toEqual([1, 2, 5, 6]);
  });

  it("AC-11: fills the slots left in score order, ignoring the cap", () => {
    const ranked = [
      candidate(1, 9, 0.9),
      candidate(2, 9, 0.8),
      candidate(3, 9, 0.7),
      candidate(4, 8, 0.1),
    ];

    const picked = pickWithVariety(ranked, 3, 1);

    // Pass 1 takes 1 and 4. Pass 2 fills the last slot with 2.
    expect(picked.map((c) => c.movieId)).toEqual([1, 2, 4]);
  });

  it("AC-11: fills the whole batch when one anchor is behind every candidate", () => {
    const ranked = Array.from({ length: 10 }, (_, i) =>
      candidate(i + 1, 7, 1 - i / 100),
    );

    expect(pickWithVariety(ranked, 6, 3)).toHaveLength(6);
  });

  it("AC-1: sorts the final list by score, then by movie id", () => {
    const ranked = [
      candidate(30, 1, 0.9),
      candidate(10, 2, 0.5),
      candidate(20, 3, 0.5),
      candidate(5, 4, 0.1),
    ];

    const picked = pickWithVariety(ranked, 4, 1);

    expect(picked.map((c) => c.movieId)).toEqual([30, 10, 20, 5]);
  });

  it("AC-1: puts a lower movie id first on equal scores even when the ranking had it second", () => {
    const ranked = [candidate(30, 1, 0.5), candidate(10, 2, 0.5)];

    const picked = pickWithVariety(ranked, 2, 3);

    expect(picked.map((c) => c.movieId)).toEqual([10, 30]);
  });

  it("AC-1: re-sorts after the second pass so a late fill sits in score order", () => {
    const ranked = [
      candidate(1, 9, 0.9),
      candidate(2, 9, 0.85),
      candidate(3, 8, 0.2),
    ];

    const picked = pickWithVariety(ranked, 3, 1);

    expect(picked.map((c) => c.movieId)).toEqual([1, 2, 3]);
  });

  it("AC-1: returns at most the limit", () => {
    const ranked = Array.from({ length: 10 }, (_, i) =>
      candidate(i + 1, i + 1, 1 - i / 100),
    );

    expect(pickWithVariety(ranked, 4, 3)).toHaveLength(4);
  });

  it("returns every candidate when there are fewer than the limit", () => {
    const ranked = [candidate(1, 1, 0.9), candidate(2, 1, 0.8)];

    expect(pickWithVariety(ranked, 20, 1)).toHaveLength(2);
  });

  it("returns an empty list for no candidates", () => {
    expect(pickWithVariety([], 20, 3)).toEqual([]);
  });

  it("does not change the list it was given", () => {
    const ranked = [candidate(1, 1, 0.9), candidate(2, 1, 0.8)];
    const copy = structuredClone(ranked);

    pickWithVariety(ranked, 2, 1);

    expect(ranked).toEqual(copy);
  });

  it("keeps extra fields on the picked candidates", () => {
    const ranked = [{ movieId: 1, anchorId: 2, score: 0.5, note: "kept" }];

    expect(pickWithVariety(ranked, 1, 3)[0].note).toBe("kept");
  });
});

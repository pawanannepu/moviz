import { describe, expect, it } from "vitest";
import { canFinish, counterText, deckStatus } from "./deck-rules";

describe("deckStatus (AC-8, AC-9)", () => {
  it.each([
    // rated, shown, remaining, status
    [0, 0, 150, "swiping"],
    [9, 9, 100, "swiping"],
    [9, 40, 100, "swiping"], // the cap does not apply below 10 ratings
    [10, 10, 100, "can_finish"],
    [10, 29, 100, "can_finish"],
    [10, 30, 100, "ended_enough"],
    [19, 25, 100, "can_finish"],
    [20, 20, 100, "ended_enough"],
    [3, 3, 0, "ended_pool"],
    [25, 40, 0, "ended_pool"], // an empty pool comes first
    [0, 0, 0, "ended_pool"],
  ] as const)(
    "rated %i, shown %i, remaining %i is %s",
    (rated, shown, remaining, status) => {
      expect(deckStatus({ rated, shown, remaining })).toBe(status);
    },
  );
});

describe("canFinish (AC-7, AC-9)", () => {
  it("refuses while swiping", () => {
    expect(canFinish({ rated: 9, shown: 9, remaining: 50 })).toBe(false);
  });

  it("allows once 10 are rated", () => {
    expect(canFinish({ rated: 10, shown: 10, remaining: 50 })).toBe(true);
  });

  it("allows a used up pool with at least one rating", () => {
    expect(canFinish({ rated: 1, shown: 5, remaining: 0 })).toBe(true);
  });

  it("refuses a used up pool with no rating (an empty catalog)", () => {
    expect(canFinish({ rated: 0, shown: 0, remaining: 0 })).toBe(false);
    expect(canFinish({ rated: 0, shown: 4, remaining: 0 })).toBe(false);
  });
});

describe("counterText (AC-4)", () => {
  it("counts towards 10, then just counts", () => {
    expect(counterText(0)).toBe("0 of 10 rated");
    expect(counterText(9)).toBe("9 of 10 rated");
    expect(counterText(10)).toBe("10 rated");
    expect(counterText(14)).toBe("14 rated");
  });
});

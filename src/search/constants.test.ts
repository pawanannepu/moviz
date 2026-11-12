import { describe, expect, it } from "vitest";
import {
  EXAMPLE_PHRASES,
  emptyHeading,
  lookingForLine,
  PHRASE_MAX_LENGTH,
  PHRASE_MIN_LENGTH,
  picksAnnouncement,
  quotaMessage,
  resultsHeading,
  SEARCH_DAILY_LIMIT,
  SEARCH_PATH,
} from "./constants";

// Spec 0012: the fixed copy and limits that the page and the server share.
describe("bite search copy", () => {
  it("lists the three example phrases (AC-1)", () => {
    expect(EXAMPLE_PHRASES).toEqual([
      "something short and funny tonight",
      "a slow moody thriller from the 90s",
      "a feel good classic for a rainy Sunday",
    ]);
  });

  it("pins the page, the daily cap and the phrase limits (AC-2, AC-3)", () => {
    expect(SEARCH_PATH).toBe("/search");
    expect(SEARCH_DAILY_LIMIT).toBe(30);
    expect([PHRASE_MIN_LENGTH, PHRASE_MAX_LENGTH]).toEqual([2, 120]);
  });

  it("words the results heading and the empty heading (AC-11, AC-12)", () => {
    expect(resultsHeading("dark")).toBe("Picks for “dark”");
    expect(emptyHeading("dark")).toBe("Nothing fits “dark”.");
  });

  it("announces the real count, singular for one (AC-11)", () => {
    expect(picksAnnouncement(8, "dark")).toBe("8 picks for dark");
    expect(picksAnnouncement(1, "dark")).toBe("1 pick for dark");
  });

  it("joins the filter labels, or shows no line without filters (AC-5)", () => {
    expect(lookingForLine(["under 100 minutes", "from the 1980s"])).toBe(
      "Looking for: under 100 minutes, from the 1980s",
    );
    expect(lookingForLine([])).toBeNull();
  });

  it("words the quota message with the given time (AC-3)", () => {
    expect(quotaMessage("1:00 AM")).toBe(
      "You have used today's 30 searches. More after 1:00 AM.",
    );
  });
});

import { describe, expect, it } from "vitest";
import { parsePhrase, phraseWithoutRuleWords } from "./parse-phrase";

// Spec 0012: the word rules (AC-4) and the "Looking for" labels (AC-5).
const YEAR = { currentYear: 2026 };
const parse = (phrase: string) => parsePhrase(phrase, YEAR);

describe("parsePhrase runtime rules (AC-4, AC-5)", () => {
  it.each([
    ["short", 100],
    ["something quick tonight", 100],
    ["under 90 minutes", 90],
    ["under 45 mins", 45],
    ["under 2 hours", 120],
    ["under 1 hour", 60],
    ["under 1.5 hours", 90],
    ["under 1.75 hours", 105],
  ])("reads %j as at most %i minutes", (phrase, minutes) => {
    expect(parse(phrase)).toEqual({
      runtimeMax: minutes,
      labels: [`under ${minutes} minutes`],
    });
  });

  it.each(["long", "an epic war film"])(
    "reads %j as at least 150 minutes",
    (phrase) => {
      expect(parse(phrase)).toEqual({
        runtimeMin: 150,
        labels: ["at least 150 minutes"],
      });
    },
  );

  it("keeps the smaller maximum when two maximum rules are given", () => {
    expect(parse("short, under 90 minutes").runtimeMax).toBe(90);
    expect(parse("short, under 3 hours").runtimeMax).toBe(100);
  });

  it("drops both runtime rules when a maximum and a minimum are given", () => {
    expect(parse("a short epic")).toEqual({ labels: [] });
  });

  it("ignores written numbers, which are not rules", () => {
    expect(parse("under two hours")).toEqual({ labels: [] });
  });
});

describe("parsePhrase year rules (AC-4, AC-5)", () => {
  it.each([
    ["1980s", 1980],
    ["the 1920s", 1920],
    ["2020s", 2020],
    ["80s", 1980],
    ["'80s", 1980],
    ["’70s", 1970],
    ["30s", 1930],
    ["90s", 1990],
    ["00s", 2000],
    ["10s", 2010],
    ["20s", 2020],
    ["eighties", 1980],
    ["the thirties", 1930],
    ["nineties", 1990],
  ])("reads %j as the %is", (phrase, decade) => {
    expect(parse(phrase)).toEqual({
      yearFrom: decade,
      yearTo: decade + 9,
      labels: [`from the ${decade}s`],
    });
  });

  it.each(["1910s", "2030s", "1985s"])(
    "ignores %j, which is not a decade the rules know",
    (phrase) => {
      expect(parse(phrase)).toEqual({ labels: [] });
    },
  );

  it.each(["old", "a classic"])(
    "reads %j as released before 1980",
    (phrase) => {
      expect(parse(phrase)).toEqual({ yearTo: 1979, labels: ["before 1980"] });
    },
  );

  it.each(["new", "something recent"])(
    "reads %j as the current UTC year or the 3 years before it",
    (phrase) => {
      expect(parse(phrase)).toEqual({
        yearFrom: 2023,
        yearTo: 2026,
        labels: ["from 2023 on"],
      });
    },
  );

  it("takes the current year from the caller", () => {
    expect(parsePhrase("recent", { currentYear: 2030 }).yearFrom).toBe(2027);
  });

  it("drops every year rule when two different ones are given", () => {
    expect(parse("80s or 90s")).toEqual({ labels: [] });
    expect(parse("an old 90s film")).toEqual({ labels: [] });
  });

  it("treats the same rule twice as one rule", () => {
    expect(parse("an old classic")).toEqual({
      yearTo: 1979,
      labels: ["before 1980"],
    });
  });
});

describe("parsePhrase matching (AC-4, AC-5)", () => {
  it("matches whole words only", () => {
    expect(parse("shortcake")).toEqual({ labels: [] });
    expect(parse("longing")).toEqual({ labels: [] });
    expect(parse("renewal")).toEqual({ labels: [] });
    expect(parse("a1980s")).toEqual({ labels: [] });
  });

  it("ignores case", () => {
    expect(parse("SHORT and from the EIGHTIES")).toEqual({
      runtimeMax: 100,
      yearFrom: 1980,
      yearTo: 1989,
      labels: ["under 100 minutes", "from the 1980s"],
    });
  });

  it("lists runtime before years, whatever the order in the phrase", () => {
    expect(parse("from the 1980s and short").labels).toEqual([
      "under 100 minutes",
      "from the 1980s",
    ]);
  });

  it("finds no filters in a plain mood phrase", () => {
    expect(parse("something funny and warm")).toEqual({ labels: [] });
  });

  it("also matches the rule words inside a title, as the spec accepts", () => {
    expect(parse("The Old Guard").yearTo).toBe(1979);
  });
});

describe("phraseWithoutRuleWords (AC-9)", () => {
  it("takes out every rule match and collapses the spaces", () => {
    expect(
      phraseWithoutRuleWords("a short heist under 2 hours from the 80s", YEAR),
    ).toBe("a heist from the");
  });

  it("returns an empty string when only rule words are left", () => {
    expect(phraseWithoutRuleWords("short", YEAR)).toBe("");
  });

  it("leaves a phrase with no rule words as it is", () => {
    expect(phraseWithoutRuleWords("a quiet road movie", YEAR)).toBe(
      "a quiet road movie",
    );
  });

  it("takes out rule words even when the rules cancel each other", () => {
    expect(phraseWithoutRuleWords("short epic heist", YEAR)).toBe("heist");
  });
});

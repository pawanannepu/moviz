import { describe, expect, it } from "vitest";
import { biteReasonSentence } from "./reason-sentence";

// Spec 0012, AC-8: the reason line of a search card.
const HEAT = { movieId: 1, title: "Heat", releaseYear: 1995 };

describe("biteReasonSentence (AC-8)", () => {
  it("names the closest liked movie with its year in vibe mode", () => {
    expect(
      biteReasonSentence({ kind: "bite_vibe", phrase: "dark", anchor: HEAT }),
    ).toBe("Fits “dark”, close to Heat (1995)");
  });

  it("leaves out the year and the parentheses when the year is null", () => {
    expect(
      biteReasonSentence({
        kind: "bite_vibe",
        phrase: "dark",
        anchor: { ...HEAT, releaseYear: null },
      }),
    ).toBe("Fits “dark”, close to Heat");
  });

  it("names no movie when there is no anchor", () => {
    expect(
      biteReasonSentence({ kind: "bite_vibe", phrase: "dark", anchor: null }),
    ).toBe("Fits “dark”");
  });

  it("says the words matched in words mode", () => {
    expect(biteReasonSentence({ kind: "bite_words", phrase: "dark" })).toBe(
      "Matches your words “dark”",
    );
  });

  it("cuts a phrase longer than 40 characters to 40 with an ellipsis", () => {
    const phrase = `${"a".repeat(40)}${"b".repeat(20)}`;
    expect(biteReasonSentence({ kind: "bite_words", phrase })).toBe(
      `Matches your words “${"a".repeat(40)}…”`,
    );
  });

  it("keeps a phrase of exactly 40 characters whole", () => {
    const phrase = "c".repeat(40);
    expect(
      biteReasonSentence({ kind: "bite_vibe", phrase, anchor: null }),
    ).toBe(`Fits “${phrase}”`);
  });

  it("never ends with a full stop", () => {
    for (const reason of [
      { kind: "bite_vibe" as const, phrase: "x.", anchor: HEAT },
      { kind: "bite_words" as const, phrase: "y" },
    ]) {
      expect(biteReasonSentence(reason).endsWith(".")).toBe(false);
    }
  });
});

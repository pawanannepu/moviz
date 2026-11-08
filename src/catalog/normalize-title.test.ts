import { describe, expect, it } from "vitest";
import { normalizeTitle } from "./normalize-title";

describe("normalizeTitle", () => {
  it("gives the same key for upper case, lower case and accented spellings (AC-9)", () => {
    expect(normalizeTitle("AMELIE")).toBe("amelie");
    expect(normalizeTitle("Amélie")).toBe("amelie");
    expect(normalizeTitle("amelie")).toBe("amelie");
  });

  it("keeps articles", () => {
    expect(normalizeTitle("The Matrix")).toBe("the matrix");
  });

  it("turns an ampersand into the word and, with or without spaces", () => {
    expect(normalizeTitle("Fast & Furious")).toBe("fast and furious");
    expect(normalizeTitle("Fast&Furious")).toBe("fast and furious");
  });

  it("turns punctuation runs into a single space", () => {
    expect(normalizeTitle("Spider-Man: No Way Home")).toBe(
      "spider man no way home",
    );
    expect(normalizeTitle("Se7en...!!")).toBe("se7en");
  });

  it("keeps digits", () => {
    expect(normalizeTitle("2001: A Space Odyssey")).toBe(
      "2001 a space odyssey",
    );
  });

  it("trims and collapses surrounding and repeated whitespace", () => {
    expect(normalizeTitle("   Heat   ")).toBe("heat");
    expect(normalizeTitle("Blade \t\n Runner")).toBe("blade runner");
  });

  it("folds full width letters and ligatures", () => {
    expect(normalizeTitle("ＭＡＴＲＩＸ")).toBe("matrix");
    expect(normalizeTitle("ﬁlm")).toBe("film");
  });

  it("keeps letters from other scripts", () => {
    expect(normalizeTitle("Левиафан")).toBe("левиафан");
  });

  it("returns an empty string for an empty or punctuation only title", () => {
    expect(normalizeTitle("")).toBe("");
    expect(normalizeTitle("?!...")).toBe("");
  });

  it("is stable: normalizing a key again changes nothing", () => {
    for (const title of [
      "Amélie",
      "Fast & Furious",
      "Spider-Man: Far From Home",
      "  ＭＡＴＲＩＸ  ",
    ]) {
      const once = normalizeTitle(title);
      expect(normalizeTitle(once)).toBe(once);
    }
  });
});

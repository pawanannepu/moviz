import { describe, expect, it } from "vitest";
import { nameFromEmail } from "./name-from-email";

describe("nameFromEmail (AC-12)", () => {
  it.each([
    ["ana@example.com", "ana"],
    ["ana.smith+movies@example.com", "ana.smith+movies"],
    ["  ana@example.com  ", "ana"],
    ["weird@name@example.com", "weird@name"],
    ["ünï@example.com", "ünï"],
  ])("takes the part before the last @ in %j", (email, expected) => {
    expect(nameFromEmail(email)).toBe(expected);
  });

  it.each(["", "   "])("falls back to a friendly name for %j", (email) => {
    expect(nameFromEmail(email)).toBe("Movie fan");
  });

  it("returns the whole text when there is no @", () => {
    expect(nameFromEmail("ana")).toBe("ana");
  });
});

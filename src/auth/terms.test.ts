import { describe, expect, it } from "vitest";
import { LEGAL_UPDATED_ON } from "@/legal/operator";
import { TERMS_VERSION } from "./terms";

// Spec 0014, AC-5: the recorded terms version is the legal pages' date.
describe("TERMS_VERSION (AC-5)", () => {
  it("is LEGAL_UPDATED_ON, so the two can never drift", () => {
    expect(TERMS_VERSION).toBe(LEGAL_UPDATED_ON);
  });

  it("is a YYYY-MM-DD date, not the old pre-launch marker", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(TERMS_VERSION).not.toBe("pre-launch");
  });
});

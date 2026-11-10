import { describe, expect, it } from "vitest";
import { pgArray } from "./pg-array";

describe("pgArray", () => {
  it("formats integers as a Postgres array literal", () => {
    expect(pgArray([1, 2, 3])).toBe("{1,2,3}");
  });

  it("formats an empty list as an empty array", () => {
    expect(pgArray([])).toBe("{}");
  });

  it("keeps negative and decimal numbers", () => {
    expect(pgArray([-0.5, 0.25, 1])).toBe("{-0.5,0.25,1}");
  });

  it("keeps a large safe integer exact", () => {
    expect(pgArray([Number.MAX_SAFE_INTEGER])).toBe("{9007199254740991}");
  });
});

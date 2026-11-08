import { describe, expect, it } from "vitest";
import { isDesignPageHidden } from "./is-design-page-hidden";

describe("isDesignPageHidden (AC-17)", () => {
  it("hides the page in production", () => {
    expect(isDesignPageHidden("production")).toBe(true);
  });

  it.each(["preview", "development", "", undefined])(
    "shows the page when VERCEL_ENV is %s",
    (value) => {
      expect(isDesignPageHidden(value)).toBe(false);
    },
  );
});

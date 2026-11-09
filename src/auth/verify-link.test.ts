import { describe, expect, it } from "vitest";
import { withVerifyCallback } from "./verify-link";

const BASE = "http://localhost:3000/api/auth/verify-email";

describe("withVerifyCallback", () => {
  it("replaces the home page fallback that sign in sends", () => {
    const out = withVerifyCallback(
      `${BASE}?token=abc&callbackURL=%2F`,
      "/verify-email",
    );
    const url = new URL(out);
    expect(url.searchParams.get("callbackURL")).toBe("/verify-email");
    expect(url.searchParams.get("token")).toBe("abc");
  });

  it("adds the callback when the link has none", () => {
    const url = new URL(
      withVerifyCallback(`${BASE}?token=abc`, "/verify-email"),
    );
    expect(url.searchParams.get("callbackURL")).toBe("/verify-email");
  });

  it("leaves a link that already points there unchanged in meaning", () => {
    const url = new URL(
      withVerifyCallback(
        `${BASE}?token=abc&callbackURL=%2Fverify-email`,
        "/verify-email",
      ),
    );
    expect(url.searchParams.getAll("callbackURL")).toEqual(["/verify-email"]);
  });

  it("keeps a long token intact", () => {
    const token = "eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImFAYi50ZXN0In0.sig-_x";
    const url = new URL(
      withVerifyCallback(
        `${BASE}?token=${token}&callbackURL=%2F`,
        "/verify-email",
      ),
    );
    expect(url.searchParams.get("token")).toBe(token);
  });
});

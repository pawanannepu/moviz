import { describe, expect, it } from "vitest";
import { HOME_PATH } from "./paths";
import { safeReturnPath } from "./return-path";

describe("safeReturnPath (AC-4)", () => {
  it.each([
    ["/home", "/home"],
    ["/home?tab=picks", "/home?tab=picks"],
    ["/movies/42", "/movies/42"],
    ["/movies/42#reason", "/movies/42"],
  ])("keeps the plain path %s", (raw, expected) => {
    expect(safeReturnPath(raw)).toBe(expected);
  });

  it.each([
    "//evil.com",
    "///evil.com",
    "https://evil.com",
    "http://evil.com/home",
    "javascript:alert(1)",
    "/\\evil.com",
    "\\\\evil.com",
    "evil.com",
    "home",
  ])("falls back to home for the unsafe value %s", (raw) => {
    expect(safeReturnPath(raw)).toBe(HOME_PATH);
  });

  // The URL parser removes dot segments, so these only become `//evil.com`
  // after parsing. A browser reads that as another site.
  it.each([
    "/.//evil.com",
    "/..//evil.com",
    "/a/..//evil.com",
    "/%2e//evil.com",
    "/%2E%2E//evil.com",
    "/.///evil.com",
    "/.//evil.com/home?x=1",
  ])("falls back to home for the dot segment value %s", (raw) => {
    expect(safeReturnPath(raw)).toBe(HOME_PATH);
  });

  it.each([
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "/\u0000x",
    "/a\u007fb",
  ])("falls back to home for a control character (%j)", (raw) => {
    expect(safeReturnPath(raw)).toBe(HOME_PATH);
  });

  it.each([null, undefined, ""])("falls back to home for %j", (raw) => {
    expect(safeReturnPath(raw)).toBe(HOME_PATH);
  });

  it.each([
    "/sign-in",
    "/sign-in?returnTo=/home",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/sign-in/",
  ])("never sends a person back to the auth page %s", (raw) => {
    expect(safeReturnPath(raw)).toBe(HOME_PATH);
  });

  it.each(["/api", "/api/auth/get-session", "/api/anything"])(
    "never returns the API path %s",
    (raw) => {
      expect(safeReturnPath(raw)).toBe(HOME_PATH);
    },
  );

  it("stays on this site for an encoded double slash", () => {
    const out = safeReturnPath("/%2F%2Fevil.com");
    expect(out.startsWith("/")).toBe(true);
    expect(out.startsWith("//")).toBe(false);
  });

  it("stays on this site for an encoded tab after the slash", () => {
    const out = safeReturnPath("/%09/evil.com");
    expect(out.startsWith("//")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isApiPath, isPublicPath } from "./public-paths";

describe("isPublicPath (AC-8)", () => {
  it.each([
    "/",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/privacy",
    "/terms",
    "/design",
    "/design/anything",
    "/api/auth/sign-in/email",
    "/api/auth/get-session",
    "/api/cron/catalog",
  ])("is open to signed out visitors: %s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each([
    "/home",
    "/home/",
    "/movies/1",
    "/settings",
    "/api/anything",
    "/api/ratings",
    "/something-new",
  ])("is closed by default: %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });

  it("ignores a trailing slash on a public page", () => {
    expect(isPublicPath("/sign-in/")).toBe(true);
    expect(isPublicPath("/api/auth/")).toBe(true);
  });

  it("does not open a path that only starts with a public name", () => {
    expect(isPublicPath("/sign-in-admin")).toBe(false);
    expect(isPublicPath("/designer")).toBe(false);
    expect(isPublicPath("/api/authors")).toBe(false);
    expect(isPublicPath("/api/cronjobs")).toBe(false);
  });
});

describe("isApiPath", () => {
  it.each(["/api", "/api/x", "/api/auth/y"])("is true for %s", (path) => {
    expect(isApiPath(path)).toBe(true);
  });

  it.each(["/", "/home", "/apiary", "/app/api"])("is false for %s", (path) => {
    expect(isApiPath(path)).toBe(false);
  });
});

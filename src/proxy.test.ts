import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeEnv: { VERCEL_ENV: string | undefined } = { VERCEL_ENV: undefined };
vi.mock("@/env", () => ({ env: fakeEnv }));

const { proxy } = await import("./proxy");

const BASE = "http://localhost:3000";

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${BASE}${path}`, { headers });
}

beforeEach(() => {
  fakeEnv.VERCEL_ENV = undefined;
});

describe("proxy, signed out (AC-8)", () => {
  it("redirects a protected page to sign in with the path as returnTo", () => {
    const response = proxy(request("/home"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${BASE}/sign-in?returnTo=%2Fhome`,
    );
  });

  it("keeps the query string in returnTo", () => {
    const response = proxy(request("/movies/1?tab=picks"));

    expect(response.headers.get("location")).toBe(
      `${BASE}/sign-in?returnTo=${encodeURIComponent("/movies/1?tab=picks")}`,
    );
  });

  it("returns 401 JSON for a protected API path, not a redirect", async () => {
    const response = proxy(request("/api/anything"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it.each([
    "/",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/design",
  ])("lets a signed out visitor open the public page %s", (path) => {
    const response = proxy(request(path));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each(["/api/auth/get-session", "/api/cron/catalog"])(
    "lets the public API path %s through to its own checks",
    (path) => {
      expect(proxy(request(path)).status).toBe(200);
    },
  );
});

describe("proxy, with a session cookie", () => {
  it("lets a protected page through when a session cookie is present", () => {
    const response = proxy(
      request("/home", { cookie: "better-auth.session_token=anything.value" }),
    );

    expect(response.status).toBe(200);
  });

  it("only checks that a cookie exists: the page itself checks the real session", () => {
    const response = proxy(
      request("/home", { cookie: "better-auth.session_token=forged.value" }),
    );

    expect(response.status).toBe(200);
  });

  it("recognises the secure cookie name used on hosted deployments", () => {
    const response = proxy(
      request("/home", { cookie: "__Secure-better-auth.session_token=x.y" }),
    );

    expect(response.status).toBe(200);
  });

  it("does not treat an unrelated cookie as a session", () => {
    const response = proxy(request("/home", { cookie: "theme=dark" }));

    expect(response.status).toBe(307);
  });
});

describe("proxy, trusted client address (AC-11)", () => {
  it.each(["preview", "production"])(
    "answers 503 no_trusted_ip on %s when an auth request has no address",
    async (vercelEnv) => {
      fakeEnv.VERCEL_ENV = vercelEnv;

      const response = proxy(request("/api/auth/get-session"));

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "no_trusted_ip" });
    },
  );

  it("answers 503 for two addresses and for a value that is not an address", () => {
    fakeEnv.VERCEL_ENV = "production";

    expect(
      proxy(
        request("/api/auth/get-session", {
          "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        }),
      ).status,
    ).toBe(503);
    expect(
      proxy(
        request("/api/auth/get-session", { "x-forwarded-for": "not-an-ip" }),
      ).status,
    ).toBe(503);
  });

  it("lets one real address through", () => {
    fakeEnv.VERCEL_ENV = "production";

    expect(
      proxy(
        request("/api/auth/get-session", { "x-forwarded-for": "203.0.113.9" }),
      ).status,
    ).toBe(200);
  });

  it("does not require an address locally or in CI", () => {
    expect(proxy(request("/api/auth/get-session")).status).toBe(200);
  });

  it("does not require an address for pages outside the auth API", () => {
    fakeEnv.VERCEL_ENV = "production";

    expect(proxy(request("/sign-in")).status).toBe(200);
  });
});

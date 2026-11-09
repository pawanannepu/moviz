import { afterEach, describe, expect, it, vi } from "vitest";

const VALID_URL = "postgres://app:pw@db.example.test:5432/moviz";
const SECRET = "x".repeat(32);
/** The smallest record the app accepts: database, auth secret, base URL and the Turnstile keys. */
const BASE = {
  DATABASE_URL: VALID_URL,
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: "http://localhost:3000",
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
};

/** `src/env.ts` validates at import, so each test loads it fresh with a chosen environment. */
async function loadEnvModule(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const name of [
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "DATABASE_URL_TEST",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "VERCEL_ENV",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
  ]) {
    vi.stubEnv(name, vars[name]);
  }
  return import("./env");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("parseEnv", () => {
  it("accepts the smallest valid record", async () => {
    const { parseEnv } = await loadEnvModule(BASE);
    expect(parseEnv(BASE).ok).toBe(true);
  });

  it("accepts every optional name when they are valid", async () => {
    const { parseEnv } = await loadEnvModule(BASE);
    const result = parseEnv({
      ...BASE,
      DATABASE_URL_UNPOOLED: VALID_URL,
      DATABASE_URL_TEST: VALID_URL,
      VERCEL_URL: "moviz-abc.vercel.app",
      VERCEL_BRANCH_URL: "moviz-git-feat.vercel.app",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Moviz <hello@example.test>",
    });
    expect(result.ok).toBe(true);
  });

  it("names DATABASE_URL when it is missing", async () => {
    const { parseEnv } = await loadEnvModule(BASE);
    const { DATABASE_URL: _omitted, ...rest } = BASE;
    expect(parseEnv(rest)).toEqual({ ok: false, invalid: ["DATABASE_URL"] });
  });

  it("names DATABASE_URL when it is not a URL", async () => {
    const { parseEnv } = await loadEnvModule(BASE);
    expect(parseEnv({ ...BASE, DATABASE_URL: "not a url" })).toEqual({
      ok: false,
      invalid: ["DATABASE_URL"],
    });
  });

  it("requires both Turnstile keys, and a blank key counts as missing", async () => {
    const { parseEnv } = await loadEnvModule(BASE);
    const { TURNSTILE_SITE_KEY: _site, ...noSite } = BASE;
    expect(parseEnv(noSite)).toEqual({
      ok: false,
      invalid: ["TURNSTILE_SITE_KEY"],
    });
    expect(parseEnv({ ...BASE, TURNSTILE_SECRET_KEY: "" })).toEqual({
      ok: false,
      invalid: ["TURNSTILE_SECRET_KEY"],
    });
  });

  it("requires BETTER_AUTH_SECRET", async () => {
    const { parseEnv } = await loadEnvModule(BASE);
    const { BETTER_AUTH_SECRET: _omitted, ...rest } = BASE;
    expect(parseEnv(rest)).toEqual({
      ok: false,
      invalid: ["BETTER_AUTH_SECRET"],
    });
  });

  it("rejects a BETTER_AUTH_SECRET shorter than 32 characters", async () => {
    const { parseEnv } = await loadEnvModule(BASE);
    const result = parseEnv({ ...BASE, BETTER_AUTH_SECRET: "short" });
    expect(result).toEqual({ ok: false, invalid: ["BETTER_AUTH_SECRET"] });
  });

  it("requires BETTER_AUTH_URL, except on a Vercel preview", async () => {
    const { parseEnv } = await loadEnvModule(BASE);
    const { BETTER_AUTH_URL: _omitted, ...rest } = BASE;
    expect(parseEnv(rest)).toEqual({ ok: false, invalid: ["BETTER_AUTH_URL"] });
    expect(parseEnv({ ...rest, BETTER_AUTH_URL: "" })).toEqual({
      ok: false,
      invalid: ["BETTER_AUTH_URL"],
    });
    expect(
      parseEnv({
        ...rest,
        VERCEL_ENV: "preview",
        RESEND_API_KEY: "re_test",
        EMAIL_FROM: "onboarding@resend.dev",
      }).ok,
    ).toBe(true);
  });

  it("lets local development omit the email settings", async () => {
    const { parseEnv } = await loadEnvModule(BASE);
    expect(parseEnv(BASE).ok).toBe(true);
    expect(parseEnv({ ...BASE, VERCEL_ENV: "development" }).ok).toBe(true);
  });

  it("requires the email settings on preview and production", async () => {
    const { parseEnv } = await loadEnvModule(BASE);
    for (const hosted of ["preview", "production"]) {
      const result = parseEnv({ ...BASE, VERCEL_ENV: hosted });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect([...result.invalid].sort()).toEqual([
          "EMAIL_FROM",
          "RESEND_API_KEY",
        ]);
      }
    }
  });

  it("lists each bad name once, even with several problems", async () => {
    const { parseEnv } = await loadEnvModule(BASE);
    const result = parseEnv({
      TURNSTILE_SITE_KEY: BASE.TURNSTILE_SITE_KEY,
      TURNSTILE_SECRET_KEY: BASE.TURNSTILE_SECRET_KEY,
      DATABASE_URL: "nope",
      BETTER_AUTH_URL: "nope",
      BETTER_AUTH_SECRET: "short",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect([...result.invalid].sort()).toEqual([
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
        "DATABASE_URL",
      ]);
    }
  });

  it("never puts a value in the result, only names", async () => {
    const { parseEnv } = await loadEnvModule(BASE);
    const result = parseEnv({
      ...BASE,
      BETTER_AUTH_SECRET: "super-secret-short",
    });
    expect(JSON.stringify(result)).not.toContain("super-secret-short");
    expect(JSON.stringify(result)).not.toContain("db.example.test");
  });
});

describe("env", () => {
  it("exposes the validated values", async () => {
    const { env } = await loadEnvModule(BASE);
    expect(env.DATABASE_URL).toBe(VALID_URL);
  });

  it("throws at import and names the bad variable but not its value", async () => {
    const badValue = "this-is-not-a-url-and-is-private";
    let thrown: unknown;
    try {
      await loadEnvModule({ ...BASE, DATABASE_URL: badValue });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain(badValue);
  });

  it("throws at import when DATABASE_URL is missing", async () => {
    await expect(
      loadEnvModule({ ...BASE, DATABASE_URL: undefined }),
    ).rejects.toThrow(/DATABASE_URL/);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const VALID_URL = "postgres://app:pw@db.example.test:5432/moviz";

/** `src/env.ts` validates at import, so each test loads it fresh with a chosen environment. */
async function loadEnvModule(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const name of [
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "DATABASE_URL_TEST",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
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
  it("accepts a record that has only DATABASE_URL", async () => {
    const { parseEnv } = await loadEnvModule({ DATABASE_URL: VALID_URL });
    const result = parseEnv({ DATABASE_URL: VALID_URL });
    expect(result.ok).toBe(true);
  });

  it("accepts every optional name when they are valid", async () => {
    const { parseEnv } = await loadEnvModule({ DATABASE_URL: VALID_URL });
    const result = parseEnv({
      DATABASE_URL: VALID_URL,
      DATABASE_URL_UNPOOLED: VALID_URL,
      DATABASE_URL_TEST: VALID_URL,
      BETTER_AUTH_SECRET: "x".repeat(32),
      BETTER_AUTH_URL: "http://localhost:3000",
    });
    expect(result.ok).toBe(true);
  });

  it("names DATABASE_URL when it is missing", async () => {
    const { parseEnv } = await loadEnvModule({ DATABASE_URL: VALID_URL });
    expect(parseEnv({})).toEqual({ ok: false, invalid: ["DATABASE_URL"] });
  });

  it("names DATABASE_URL when it is not a URL", async () => {
    const { parseEnv } = await loadEnvModule({ DATABASE_URL: VALID_URL });
    expect(parseEnv({ DATABASE_URL: "not a url" })).toEqual({
      ok: false,
      invalid: ["DATABASE_URL"],
    });
  });

  it("rejects a BETTER_AUTH_SECRET shorter than 32 characters", async () => {
    const { parseEnv } = await loadEnvModule({ DATABASE_URL: VALID_URL });
    const result = parseEnv({
      DATABASE_URL: VALID_URL,
      BETTER_AUTH_SECRET: "short",
    });
    expect(result).toEqual({ ok: false, invalid: ["BETTER_AUTH_SECRET"] });
  });

  it("lists each bad name once, even with several problems", async () => {
    const { parseEnv } = await loadEnvModule({ DATABASE_URL: VALID_URL });
    const result = parseEnv({
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
    const { parseEnv } = await loadEnvModule({ DATABASE_URL: VALID_URL });
    const result = parseEnv({
      DATABASE_URL: VALID_URL,
      BETTER_AUTH_SECRET: "super-secret-short",
    });
    expect(JSON.stringify(result)).not.toContain("super-secret-short");
    expect(JSON.stringify(result)).not.toContain("db.example.test");
  });
});

describe("env", () => {
  it("exposes the validated values", async () => {
    const { env } = await loadEnvModule({ DATABASE_URL: VALID_URL });
    expect(env.DATABASE_URL).toBe(VALID_URL);
  });

  it("throws at import and names the bad variable but not its value", async () => {
    const badValue = "this-is-not-a-url-and-is-private";
    let thrown: unknown;
    try {
      await loadEnvModule({ DATABASE_URL: badValue });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain(badValue);
  });

  it("throws at import when DATABASE_URL is missing", async () => {
    await expect(loadEnvModule({})).rejects.toThrow(/DATABASE_URL/);
  });
});

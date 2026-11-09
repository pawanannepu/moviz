import { describe, expect, it } from "vitest";
import { hasTrustedClientIp, requiresTrustedIp } from "./trusted-ip";

function headers(value: string | null) {
  return { get: (name: string) => (name === "x-forwarded-for" ? value : null) };
}

describe("hasTrustedClientIp (AC-11)", () => {
  it.each(["203.0.113.9", "10.0.0.1", "2001:db8::1", " 203.0.113.9 "])(
    "accepts exactly one real address (%s)",
    (value) => {
      expect(hasTrustedClientIp(headers(value))).toBe(true);
    },
  );

  it("rejects a missing header", () => {
    expect(hasTrustedClientIp(headers(null))).toBe(false);
  });

  it.each([
    "",
    "not-an-ip",
    "999.1.1.1",
    "203.0.113.9, 198.51.100.7",
    "203.0.113.9,",
    "evil.com",
  ])("rejects %j", (value) => {
    // A trailing comma leaves one real address, which is still one value.
    const expected = value === "203.0.113.9,";
    expect(hasTrustedClientIp(headers(value))).toBe(expected);
  });

  it("rejects a list even when every entry is a real address", () => {
    expect(hasTrustedClientIp(headers("1.1.1.1, 2.2.2.2"))).toBe(false);
  });
});

describe("requiresTrustedIp (AC-11)", () => {
  it("is required on Vercel preview and production", () => {
    expect(requiresTrustedIp("preview")).toBe(true);
    expect(requiresTrustedIp("production")).toBe(true);
  });

  it("is not required locally or in CI", () => {
    expect(requiresTrustedIp(undefined)).toBe(false);
    expect(requiresTrustedIp("development")).toBe(false);
  });
});

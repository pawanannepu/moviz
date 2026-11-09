import { describe, expect, it } from "vitest";
import {
  isPlausibleEmail,
  MIN_PASSWORD_LENGTH,
  validateCredentials,
} from "./validation";

describe("isPlausibleEmail", () => {
  it.each(["ana@example.com", "a.b+c@sub.example.co", "x@y.z"])(
    "accepts %s",
    (value) => {
      expect(isPlausibleEmail(value)).toBe(true);
    },
  );

  it.each([
    "",
    "ana",
    "ana@",
    "@example.com",
    "ana@example",
    "a na@example.com",
    "ana@@example.com",
    "ana@exa mple.com",
  ])("rejects %j", (value) => {
    expect(isPlausibleEmail(value)).toBe(false);
  });
});

describe("validateCredentials (AC-1, AC-10)", () => {
  it("returns no errors for a good email and an 8 character password", () => {
    expect(
      validateCredentials({ email: "ana@example.com", password: "12345678" }),
    ).toEqual({});
  });

  it("asks for at least 8 characters, and the boundary is exact", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(
      validateCredentials({ email: "ana@example.com", password: "1234567" })
        .password,
    ).toBe("Use at least 8 characters.");
    expect(
      validateCredentials({ email: "ana@example.com", password: "12345678" })
        .password,
    ).toBeUndefined();
  });

  it("reports both fields at once, so focus can go to the first", () => {
    const errors = validateCredentials({ email: "nope", password: "" });

    expect(errors.email).toBe("Enter a valid email, like name@example.com.");
    expect(errors.password).toBe("Use at least 8 characters.");
  });

  it("counts characters, not bytes", () => {
    expect(
      validateCredentials({ email: "ana@example.com", password: "éééééééé" }),
    ).toEqual({});
  });
});

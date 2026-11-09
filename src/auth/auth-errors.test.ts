import { describe, expect, it } from "vitest";
import {
  AUTH_NOTICES,
  type AuthError,
  noticeFor,
  toAuthError,
  toAuthMessage,
} from "./auth-errors";

describe("toAuthError (AC-10, AC-11)", () => {
  it("maps a wrong password and an unknown email to the same error", () => {
    const wrong = toAuthError({
      code: "INVALID_EMAIL_OR_PASSWORD",
      status: 401,
    });
    const unknown = toAuthError({ status: 401 });

    expect(wrong).toEqual({ code: "invalid_credentials" });
    expect(unknown).toEqual(wrong);
  });

  it("maps EMAIL_NOT_VERIFIED to its own error", () => {
    expect(toAuthError({ code: "EMAIL_NOT_VERIFIED", status: 403 })).toEqual({
      code: "email_not_verified",
    });
  });

  it("is not case sensitive about the library code", () => {
    expect(toAuthError({ code: "email_not_verified" })).toEqual({
      code: "email_not_verified",
    });
  });

  it("reads the wait from the 429 and rounds a fraction up", () => {
    expect(toAuthError({ status: 429, retryAfterSeconds: 58 })).toEqual({
      code: "rate_limited",
      seconds: 58,
    });
    expect(toAuthError({ status: 429, retryAfterSeconds: 12.2 })).toEqual({
      code: "rate_limited",
      seconds: 13,
    });
  });

  it.each([undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to 60 seconds when a 429 has no usable wait (%s)",
    (retryAfterSeconds) => {
      expect(toAuthError({ status: 429, retryAfterSeconds })).toEqual({
        code: "rate_limited",
        seconds: 60,
      });
    },
  );

  it("treats a 429 as rate limited whatever the code says", () => {
    expect(
      toAuthError({ code: "INVALID_EMAIL_OR_PASSWORD", status: 429 }).code,
    ).toBe("rate_limited");
  });

  it.each(["MISSING_RESPONSE", "VERIFICATION_FAILED", "SERVICE_UNAVAILABLE"])(
    "maps the captcha code %s to captcha_failed",
    (code) => {
      expect(toAuthError({ code })).toEqual({ code: "captcha_failed" });
    },
  );

  it.each(["TOKEN_EXPIRED", "INVALID_TOKEN"])(
    "maps %s to token_expired",
    (code) => {
      expect(toAuthError({ code })).toEqual({ code: "token_expired" });
    },
  );

  it.each([
    "PASSWORD_TOO_SHORT",
    "PASSWORD_TOO_LONG",
    "INVALID_EMAIL",
    "VALIDATION_ERROR",
  ])("maps %s to invalid_input", (code) => {
    expect(toAuthError({ code })).toEqual({ code: "invalid_input" });
  });

  it("maps an unknown code and a bare 500 to unexpected", () => {
    expect(toAuthError({ code: "SOMETHING_NEW", status: 500 })).toEqual({
      code: "unexpected",
    });
    expect(toAuthError({})).toEqual({ code: "unexpected" });
  });
});

describe("toAuthMessage (AC-10)", () => {
  const ALL: AuthError[] = [
    { code: "invalid_credentials" },
    { code: "email_not_verified" },
    { code: "rate_limited", seconds: 30 },
    { code: "captcha_failed" },
    { code: "invalid_input" },
    { code: "token_expired" },
    { code: "already_verified" },
    { code: "unexpected" },
  ];

  it("never shows a raw library code", () => {
    for (const error of ALL) {
      expect(toAuthMessage(error)).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    }
  });

  it("uses the same wording for a wrong password however it arrived", () => {
    expect(toAuthMessage({ code: "invalid_credentials" })).toBe(
      "Email or password is wrong.",
    );
  });

  it("names the wait, and uses the singular for one second", () => {
    expect(toAuthMessage({ code: "rate_limited", seconds: 42 })).toBe(
      "Too many attempts. Try again in 42 seconds.",
    );
    expect(toAuthMessage({ code: "rate_limited", seconds: 1 })).toBe(
      "Too many attempts. Try again in 1 second.",
    );
  });

  it("gives every error a different, non empty message", () => {
    const messages = ALL.map(toAuthMessage);
    expect(messages.every((message) => message.length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(ALL.length);
  });
});

describe("noticeFor (AC-6, AC-10)", () => {
  it("returns the fixed copy for a known key", () => {
    expect(noticeFor("password-updated")).toBe(
      AUTH_NOTICES["password-updated"],
    );
    expect(noticeFor("password-updated")).toBe("Password updated. Sign in.");
  });

  it.each([
    undefined,
    "",
    "anything-else",
    "<b>x</b>",
    "__proto__",
    "constructor",
    "toString",
  ])("ignores an unknown value (%s)", (value) => {
    expect(noticeFor(value)).toBeNull();
  });
});

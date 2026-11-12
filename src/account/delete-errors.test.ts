import { describe, expect, it } from "vitest";
import {
  PASSWORD_REQUIRED_MESSAGE,
  toDeleteAccountError,
  toDeleteAccountMessage,
} from "./delete-errors";

// Spec 0014, AC-11: every delete failure maps to one plain line.
describe("toDeleteAccountError (AC-11)", () => {
  it("maps a 429 to rate_limited, whatever the code says", () => {
    expect(
      toDeleteAccountError({ status: 429, code: "INVALID_PASSWORD" }),
    ).toEqual({ code: "rate_limited" });
  });

  it("maps INVALID_PASSWORD to wrong_password", () => {
    expect(
      toDeleteAccountError({ status: 400, code: "INVALID_PASSWORD" }),
    ).toEqual({ code: "wrong_password" });
  });

  it("maps PASSWORD_REQUIRED to password_required", () => {
    expect(
      toDeleteAccountError({ status: 400, code: "PASSWORD_REQUIRED" }),
    ).toEqual({ code: "password_required" });
  });

  it("reads the code in any case", () => {
    expect(toDeleteAccountError({ code: "invalid_password" })).toEqual({
      code: "wrong_password",
    });
  });

  it.each([
    { status: 500, code: "DELETE_FAILED" },
    { status: 401, code: "UNAUTHORIZED" },
    { status: undefined, code: undefined },
    {},
  ])("maps anything else to unexpected: %o", (raw) => {
    expect(toDeleteAccountError(raw)).toEqual({ code: "unexpected" });
  });
});

describe("toDeleteAccountMessage (AC-11)", () => {
  it.each([
    ["password_required", "Enter your password."],
    ["wrong_password", "That password is not right."],
    ["rate_limited", "Too many tries. Wait a minute and try again."],
    ["unexpected", "Could not delete your account. Try again."],
  ] as const)("says the spec's words for %s", (code, message) => {
    expect(toDeleteAccountMessage({ code })).toBe(message);
  });

  it("uses the same words for the field error as for a server PASSWORD_REQUIRED", () => {
    expect(PASSWORD_REQUIRED_MESSAGE).toBe(
      toDeleteAccountMessage({ code: "password_required" }),
    );
  });
});

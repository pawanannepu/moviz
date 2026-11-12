import { describe, expect, it } from "vitest";
import {
  assertLegalDetailsForBuild,
  formatLegalDate,
  type LegalDetails,
  missingLegalDetails,
} from "./operator";

const PLACEHOLDERS: LegalDetails = {
  OPERATOR_NAME: "OPERATOR_NAME",
  CONTACT_EMAIL: "CONTACT_EMAIL",
  BACKUP_RETENTION_DAYS: null,
};

const FILLED: LegalDetails = {
  OPERATOR_NAME: "Jo Doe",
  CONTACT_EMAIL: "hello@example.com",
  BACKUP_RETENTION_DAYS: 7,
};

describe("missingLegalDetails (AC-12)", () => {
  it("lists every placeholder, in order", () => {
    expect(missingLegalDetails(PLACEHOLDERS)).toEqual([
      "OPERATOR_NAME",
      "CONTACT_EMAIL",
      "BACKUP_RETENTION_DAYS",
    ]);
  });

  it("is empty when every detail is filled", () => {
    expect(missingLegalDetails(FILLED)).toEqual([]);
  });

  it("treats blank text and a bad day count as unfilled", () => {
    expect(
      missingLegalDetails({
        OPERATOR_NAME: "  ",
        CONTACT_EMAIL: "hello@example.com",
        BACKUP_RETENTION_DAYS: -1,
      }),
    ).toEqual(["OPERATOR_NAME", "BACKUP_RETENTION_DAYS"]);
  });

  it("reports the shipped placeholders today", () => {
    expect(missingLegalDetails()).toEqual([
      "OPERATOR_NAME",
      "CONTACT_EMAIL",
      "BACKUP_RETENTION_DAYS",
    ]);
  });
});

describe("assertLegalDetailsForBuild (AC-12)", () => {
  const production = { VERCEL: "1", VERCEL_ENV: "production" };

  it("throws on a production Vercel build with placeholders, naming them", () => {
    expect(() => assertLegalDetailsForBuild(production, PLACEHOLDERS)).toThrow(
      /OPERATOR_NAME, CONTACT_EMAIL, BACKUP_RETENTION_DAYS/,
    );
  });

  it("passes a production Vercel build once filled", () => {
    expect(() => assertLegalDetailsForBuild(production, FILLED)).not.toThrow();
  });

  it.each([
    {},
    { VERCEL: "1", VERCEL_ENV: "preview" },
    { VERCEL: "1", VERCEL_ENV: "development" },
    { VERCEL_ENV: "production" },
  ])("does not block a local, CI or preview build: %o", (env) => {
    expect(() => assertLegalDetailsForBuild(env, PLACEHOLDERS)).not.toThrow();
  });
});

describe("formatLegalDate", () => {
  it("writes the day, month name and year", () => {
    expect(formatLegalDate("2026-11-12")).toBe("12 November 2026");
    expect(formatLegalDate("2027-01-05")).toBe("5 January 2027");
  });

  it("returns anything else unchanged", () => {
    expect(formatLegalDate("pre-launch")).toBe("pre-launch");
  });
});

import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "./authorize";

const SECRET = "a-long-random-cron-secret";

describe("isAuthorizedCron (AC-10)", () => {
  it("accepts the right bearer token", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("refuses a missing header", () => {
    expect(isAuthorizedCron(null, SECRET)).toBe(false);
  });

  it("refuses a wrong token, a shorter one and a longer one", () => {
    expect(isAuthorizedCron("Bearer wrong", SECRET)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${SECRET.slice(1)}`, SECRET)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${SECRET}x`, SECRET)).toBe(false);
  });

  it("refuses the bare secret without the Bearer word", () => {
    expect(isAuthorizedCron(SECRET, SECRET)).toBe(false);
  });

  it("refuses a different scheme", () => {
    expect(isAuthorizedCron(`Basic ${SECRET}`, SECRET)).toBe(false);
  });

  it("refuses every call when no secret is set", () => {
    expect(isAuthorizedCron("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
  });

  it("refuses every call when the secret is empty", () => {
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer", "")).toBe(false);
  });
});

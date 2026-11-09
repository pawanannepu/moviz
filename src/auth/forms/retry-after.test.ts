import { describe, expect, it } from "vitest";
import { readRetryAfter } from "./retry-after";

function response(headers: Record<string, string>) {
  const map = new Headers(headers);
  return { headers: map };
}

describe("readRetryAfter (AC-11)", () => {
  it("reads X-Retry-After as seconds, whatever the header case", () => {
    expect(readRetryAfter(response({ "X-Retry-After": "58" }))).toBe(58);
    expect(readRetryAfter(response({ "x-retry-after": "7" }))).toBe(7);
  });

  it("returns undefined when the header is missing", () => {
    expect(readRetryAfter(response({}))).toBeUndefined();
  });

  it.each(["soon", "NaN", "Infinity"])("returns undefined for %j", (value) => {
    expect(
      readRetryAfter(response({ "X-Retry-After": value })),
    ).toBeUndefined();
  });

  it("does not read the standard Retry-After header", () => {
    expect(readRetryAfter(response({ "Retry-After": "30" }))).toBeUndefined();
  });
});

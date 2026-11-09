import { describe, expect, it } from "vitest";
import { pickSiteOrigin } from "./site-origin";

const ALLOWED = ["moviz.example", "moviz-git-feat.vercel.app"];
const FALLBACK = "https://moviz.example/some/path";

describe("pickSiteOrigin (AC-7)", () => {
  it("uses the request origin when its host is on the allowed list", () => {
    expect(
      pickSiteOrigin({
        requestUrl: "https://moviz-git-feat.vercel.app/api/auth/sign-up/email",
        allowedHosts: ALLOWED,
        fallback: FALLBACK,
      }),
    ).toBe("https://moviz-git-feat.vercel.app");
  });

  it("keeps the request's own scheme and port", () => {
    expect(
      pickSiteOrigin({
        requestUrl: "http://localhost:3000/api/auth/sign-up/email",
        allowedHosts: ["localhost:3000"],
        fallback: undefined,
      }),
    ).toBe("http://localhost:3000");
  });

  it("ignores a forged host and uses the configured origin", () => {
    expect(
      pickSiteOrigin({
        requestUrl: "https://evil.example/api/auth/sign-up/email",
        allowedHosts: ALLOWED,
        fallback: FALLBACK,
      }),
    ).toBe("https://moviz.example");
  });

  it("does not accept a host that only contains an allowed one", () => {
    expect(
      pickSiteOrigin({
        requestUrl: "https://moviz.example.evil.test/x",
        allowedHosts: ALLOWED,
        fallback: FALLBACK,
      }),
    ).toBe("https://moviz.example");
  });

  it("uses the fallback when there is no request url or it is not a url", () => {
    expect(
      pickSiteOrigin({
        requestUrl: undefined,
        allowedHosts: ALLOWED,
        fallback: FALLBACK,
      }),
    ).toBe("https://moviz.example");
    expect(
      pickSiteOrigin({
        requestUrl: "not a url",
        allowedHosts: ALLOWED,
        fallback: FALLBACK,
      }),
    ).toBe("https://moviz.example");
  });

  it("returns undefined when nothing usable is configured", () => {
    expect(
      pickSiteOrigin({
        requestUrl: undefined,
        allowedHosts: ALLOWED,
        fallback: undefined,
      }),
    ).toBeUndefined();
    expect(
      pickSiteOrigin({
        requestUrl: undefined,
        allowedHosts: ALLOWED,
        fallback: "nope",
      }),
    ).toBeUndefined();
  });
});

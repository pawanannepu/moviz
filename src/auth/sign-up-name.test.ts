import { describe, expect, it } from "vitest";
import { withDerivedName } from "./sign-up-name";

describe("withDerivedName", () => {
  it("replaces a client chosen name with the part before the @", () => {
    const out = withDerivedName({ email: "ana@example.com", name: "zed" });
    expect(out?.name).toBe("ana");
  });

  it("matches what the new account path stores, which sees a lowercased email", () => {
    const out = withDerivedName({ email: "Ana.Smith@Example.COM", name: "x" });
    expect(out?.name).toBe("ana.smith");
  });

  it("keeps every other field", () => {
    const out = withDerivedName({
      email: "a@b.test",
      password: "password1",
      callbackURL: "/verify-email",
    });
    expect(out).toMatchObject({
      password: "password1",
      callbackURL: "/verify-email",
    });
  });

  it("returns null when there is no usable email, so the library reports it", () => {
    expect(withDerivedName(undefined)).toBeNull();
    expect(withDerivedName({ name: "zed" })).toBeNull();
    expect(withDerivedName({ email: 42 })).toBeNull();
  });
});

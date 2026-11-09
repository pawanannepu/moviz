import { describe, expect, it } from "vitest";
import {
  accountExistsContent,
  escapeHtml,
  resetPasswordContent,
  verifyEmailContent,
} from "./templates";

const URL_WITH_QUERY =
  "https://moviz.example/api/auth/verify-email?token=a.b-c&callbackURL=%2Fverify-email";

describe("escapeHtml", () => {
  it("escapes the five characters that break out of HTML", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;",
    );
  });

  it("escapes the ampersand first, so it does not double escape", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("verifyEmailContent (AC-1, AC-7)", () => {
  it("carries the link once in the text and says to ignore it if not asked for", () => {
    const { subject, text } = verifyEmailContent({ url: URL_WITH_QUERY });

    expect(subject).toBe("Confirm your email for Moviz");
    expect(text.split(URL_WITH_QUERY)).toHaveLength(2);
    expect(text).toContain("If you did not sign up, ignore this email.");
    expect(text).toContain("24 hours");
  });

  it("escapes the link inside the HTML", () => {
    const { html } = verifyEmailContent({ url: URL_WITH_QUERY });

    expect(html).toContain("token=a.b-c&amp;callbackURL=%2Fverify-email");
    expect(html).not.toContain("token=a.b-c&callbackURL");
  });

  it("cannot be turned into script by a hostile link", () => {
    const { html } = verifyEmailContent({
      url: `https://x.test/"><script>alert(1)</script>`,
    });

    expect(html).not.toContain("<script>");
  });
});

describe("resetPasswordContent (AC-6)", () => {
  it("says the link works for 15 minutes and only once", () => {
    const { subject, text } = resetPasswordContent({
      url: "https://moviz.example/r/abc",
    });

    expect(subject).toBe("Reset your Moviz password");
    expect(text).toContain("https://moviz.example/r/abc");
    expect(text).toContain("15 minutes");
    expect(text).toContain("only once");
  });
});

describe("accountExistsContent (AC-7)", () => {
  const content = accountExistsContent({
    signInUrl: "https://moviz.example/sign-in",
    resetUrl: "https://moviz.example/forgot-password",
  });

  it("links to sign in and to reset, and nothing else", () => {
    const links = content.text.match(/https?:\/\/\S+/g);

    expect(links).toEqual([
      "https://moviz.example/sign-in",
      "https://moviz.example/forgot-password",
    ]);
  });

  it("holds no token and names no one", () => {
    expect(content.text).not.toMatch(/token/i);
    expect(content.html).not.toMatch(/token/i);
  });

  it("shows both links in the HTML", () => {
    expect(content.html).toContain('href="https://moviz.example/sign-in"');
    expect(content.html).toContain(
      'href="https://moviz.example/forgot-password"',
    );
  });
});

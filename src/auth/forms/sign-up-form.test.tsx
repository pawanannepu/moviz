// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Spec 0014, AC-5: the consent line on the sign up form. The bot check widget
// and the auth client are boundaries, so they are stubbed.
vi.mock("./turnstile", () => ({ Turnstile: () => null }));
vi.mock("@/auth/client", () => ({
  authClient: { signUp: { email: vi.fn() } },
}));

const { SignUpForm } = await import("./sign-up-form");

afterEach(cleanup);

const consentLine = () =>
  screen.getByText(
    (_, element) =>
      element?.tagName === "P" &&
      (element.textContent ?? "").startsWith("By creating an account"),
  );

describe("SignUpForm consent line (spec 0014, AC-5)", () => {
  it("says the consent sentence, with the new tab notes read only by screen readers", () => {
    render(<SignUpForm turnstileSiteKey="test" />);

    expect(consentLine().textContent).toBe(
      "By creating an account, you agree to the Terms of use (opens in a new tab) and the Privacy policy (opens in a new tab).",
    );
    for (const note of within(consentLine()).getAllByText(
      "(opens in a new tab)",
    )) {
      expect(note.className).toContain("sr-only");
    }
  });

  it("links the Terms of use and the Privacy policy in a new tab, safely", () => {
    render(<SignUpForm turnstileSiteKey="test" />);

    for (const [name, href] of [
      ["Terms of use (opens in a new tab)", "/terms"],
      ["Privacy policy (opens in a new tab)", "/privacy"],
    ] as const) {
      const link = within(consentLine()).getByRole("link", { name });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("sits directly above the Create account button", () => {
    render(<SignUpForm turnstileSiteKey="test" />);
    const button = screen.getByRole("button", { name: "Create account" });

    expect(consentLine().nextElementSibling).toBe(button);
  });
});

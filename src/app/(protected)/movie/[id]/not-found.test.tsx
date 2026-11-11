// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test-support/axe";

// Spec 0010, AC-3: the not found page replaces the whole movie page, so it
// draws the header itself.
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock("@/auth/forms/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

import MovieNotFoundPage from "./not-found";

afterEach(cleanup);

describe("MovieNotFoundPage (AC-3)", () => {
  it("draws the header", () => {
    render(<MovieNotFoundPage />);

    expect(
      screen.getByRole("link", { name: "Moviz" }).getAttribute("href"),
    ).toBe("/");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("shows the title, the body and the link back to /home", () => {
    render(<MovieNotFoundPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Movie not found" }),
    ).toBeTruthy();
    expect(
      screen.getByText("This movie is not in Moviz. It may have been removed."),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to picks" }).getAttribute("href"),
    ).toBe("/home");
  });

  it("has exactly one h1 (AC-18)", () => {
    render(<MovieNotFoundPage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("has no WCAG A or AA violations (AC-18)", async () => {
    const { container } = render(<MovieNotFoundPage />);

    expect(await axeViolations(container)).toEqual([]);
  });
});

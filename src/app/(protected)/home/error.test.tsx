// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test-support/axe";

// Spec 0008, AC-7 and AC-14: the page level boundary draws the header again,
// calls `retry` (not `reset`), and never logs the error.
vi.mock("@/auth/forms/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

import HomeError from "./error";

afterEach(cleanup);

describe("HomeError (AC-7)", () => {
  it("keeps the header and the page title above the error", () => {
    render(<HomeError retry={vi.fn()} />);

    expect(
      screen.getByRole("link", { name: "Moviz" }).getAttribute("href"),
    ).toBe("/");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(
      screen.getAllByRole("heading", { level: 1, name: "Your picks" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: "We couldn't load your picks." }),
    ).toBeTruthy();
    expect(
      screen.getByText("Check your connection and try again."),
    ).toBeTruthy();
  });

  it("calls retry when Try again is pressed", () => {
    const retry = vi.fn();
    render(<HomeError retry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("does not need, or call, reset", () => {
    const reset = vi.fn();
    const props = { retry: vi.fn(), reset } as unknown as Parameters<
      typeof HomeError
    >[0];
    render(<HomeError {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).not.toHaveBeenCalled();
  });

  it("writes nothing to the console, because the error could name a title or a score (AC-14)", () => {
    const spies = (["log", "info", "warn", "error"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    render(<HomeError retry={vi.fn()} />);

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("has no WCAG A or AA violations (AC-15)", async () => {
    const { container } = render(<HomeError retry={vi.fn()} />);

    expect(await axeViolations(container)).toEqual([]);
  });
});

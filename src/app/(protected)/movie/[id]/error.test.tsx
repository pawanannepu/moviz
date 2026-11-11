// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test-support/axe";

// Spec 0010, AC-10 and AC-16: the page level boundary of the movie page draws
// the header and a plain back link again, calls `retry` (not `reset`), and
// never logs the error.
const back = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ back }) }));
vi.mock("@/auth/forms/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

import MovieError from "./error";

afterEach(cleanup);

describe("MovieError (AC-10)", () => {
  it("keeps the header above the error", () => {
    render(<MovieError retry={vi.fn()} />);

    expect(
      screen.getByRole("link", { name: "Moviz" }).getAttribute("href"),
    ).toBe("/");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("shows the same words as the in page error", () => {
    render(<MovieError retry={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "We couldn't load this movie." }),
    ).toBeTruthy();
    expect(
      screen.getByText("Check your connection and try again."),
    ).toBeTruthy();
  });

  it("has exactly one h1, the error title (AC-18)", () => {
    render(<MovieError retry={vi.fn()} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "We couldn't load this movie.",
      }),
    ).toBeTruthy();
  });

  it("draws a plain Back to picks link to /home, above the error", () => {
    render(<MovieError retry={vi.fn()} />);

    const link = screen.getByRole("link", { name: "Back to picks" });
    expect(link.getAttribute("href")).toBe("/home");
    expect(
      link.compareDocumentPosition(screen.getByRole("alert")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("calls retry when Try again is pressed", () => {
    const retry = vi.fn();
    render(<MovieError retry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("does not need, or call, reset", () => {
    const reset = vi.fn();
    const props = { retry: vi.fn(), reset } as unknown as Parameters<
      typeof MovieError
    >[0];
    render(<MovieError {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).not.toHaveBeenCalled();
  });

  it("writes nothing to the console, because the error could name a title or a score (AC-16)", () => {
    const spies = (["log", "info", "warn", "error"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const props = {
      retry: vi.fn(),
      error: new Error("Because you loved Heat (1995), score 9"),
    } as unknown as Parameters<typeof MovieError>[0];

    const { container } = render(<MovieError {...props} />);

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Heat");
    vi.restoreAllMocks();
  });

  it("has no WCAG A or AA violations (AC-18)", async () => {
    const { container } = render(<MovieError retry={vi.fn()} />);

    expect(await axeViolations(container)).toEqual([]);
  });
});

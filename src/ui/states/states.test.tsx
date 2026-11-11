// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";

afterEach(cleanup);

describe("ErrorState (AC-14)", () => {
  it("is an alert with the title and body", () => {
    render(
      <ErrorState title="Couldn't load" body="Try again." onRetry={vi.fn()} />,
    );

    expect(screen.getByRole("alert").textContent).toContain("Couldn't load");
    expect(screen.getByRole("alert").textContent).toContain("Try again.");
  });

  it("calls onRetry once when Try again is pressed", () => {
    const onRetry = vi.fn();
    render(
      <ErrorState title="Couldn't load" body="Try again." onRetry={onRetry} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorState title level (spec 0010, AC-18)", () => {
  it("makes the title an h2 by default", () => {
    render(
      <ErrorState title="Couldn't load" body="Try again." onRetry={vi.fn()} />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Couldn't load" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("makes the title the h1 when the page has no other heading", () => {
    render(
      <ErrorState
        title="Couldn't load"
        body="Try again."
        onRetry={vi.fn()}
        titleAs="h1"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Couldn't load" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });
});

describe("EmptyState (AC-14)", () => {
  it("shows its action as a link", () => {
    render(
      <EmptyState
        title="No picks yet"
        body="Swipe a few movies."
        action={{ href: "/swipe", label: "Start swiping" }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Start swiping" }).getAttribute("href"),
    ).toBe("/swipe");
    expect(screen.getByRole("heading", { name: "No picks yet" })).toBeTruthy();
  });

  it("shows no link without an action", () => {
    render(<EmptyState title="No picks yet" body="Swipe a few movies." />);

    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("LoadingState (AC-14)", () => {
  it("has a status message for screen readers", () => {
    render(<LoadingState label="Loading your picks" />);

    expect(screen.getByRole("status").textContent).toBe("Loading your picks");
  });

  it("hides the static skeletons from screen readers", () => {
    const { container } = render(<LoadingState label="Loading your picks" />);

    expect(
      container.querySelector(".feed-grid")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test-support/axe";

// Spec 0010, AC-3: the not found state, with a way back that is always a
// plain link.
const { nav } = vi.hoisted(() => ({
  nav: { pathname: "/home", went: [] as string[] },
}));
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back }),
  usePathname: () => nav.pathname,
}));
// `next/link` only calls `onNavigate` for a navigation inside the app, and
// lets the handler cancel it. This stand in does the same for a click, and
// records where the click went: the address, or "cancelled".
vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    onNavigate,
    children,
    ...rest
  }: {
    href: string;
    prefetch?: boolean;
    onNavigate?: (event: { preventDefault: () => void }) => void;
    children: ReactNode;
    className?: string;
  }) => (
    <a
      {...rest}
      href={href}
      data-prefetch={String(prefetch)}
      onClick={(event) => {
        event.preventDefault();
        let cancelled = false;
        onNavigate?.({
          preventDefault: () => {
            cancelled = true;
          },
        });
        nav.went.push(cancelled ? "cancelled" : href);
      }}
    >
      {children}
    </a>
  ),
}));

import { MovieNotFound } from "./movie-not-found";

beforeEach(() => {
  vi.clearAllMocks();
  nav.went = [];
});
afterEach(cleanup);

describe("MovieNotFound (AC-3)", () => {
  it("shows the title as the one h1", () => {
    render(<MovieNotFound />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Movie not found" }),
    ).toBeTruthy();
  });

  it("says why, in one line", () => {
    render(<MovieNotFound />);

    expect(
      screen.getByText("This movie is not in Moviz. It may have been removed."),
    ).toBeTruthy();
  });

  it("links back to /home", () => {
    render(<MovieNotFound />);

    expect(
      screen.getByRole("link", { name: "Back to picks" }).getAttribute("href"),
    ).toBe("/home");
  });

  it("always navigates, and never steps back in history", () => {
    render(<MovieNotFound />);

    fireEvent.click(screen.getByRole("link", { name: "Back to picks" }));

    expect(back).not.toHaveBeenCalled();
    expect(nav.went).toEqual(["/home"]);
  });

  it("is not an alert: a missing movie is not an error", () => {
    render(<MovieNotFound />);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses an h3 on the design page, and no h1", () => {
    render(<MovieNotFound headingLevel={3} />);

    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(
      screen.getByRole("heading", { level: 3, name: "Movie not found" }),
    ).toBeTruthy();
  });

  it("has no WCAG A or AA violations (AC-18)", async () => {
    const { container } = render(<MovieNotFound />);

    expect(await axeViolations(container)).toEqual([]);
  });
});

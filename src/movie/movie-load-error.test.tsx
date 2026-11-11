// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test-support/axe";

// Spec 0010, AC-10: when the movie read fails, Try again renders the page
// again on the server with `router.refresh()`, ignores a second press while it
// runs, and says "Loading movie" in a polite status.
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { MovieLoadError } from "./movie-load-error";

const status = () => document.querySelector("p[role=status].sr-only");

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);

describe("MovieLoadError (AC-10)", () => {
  it("shows the title, the body and a Try again button", () => {
    render(<MovieLoadError />);

    expect(
      screen.getByRole("heading", { name: "We couldn't load this movie." }),
    ).toBeTruthy();
    expect(
      screen.getByText("Check your connection and try again."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("is an alert, so a screen reader hears it at once", () => {
    render(<MovieLoadError />);

    expect(screen.getByRole("alert").textContent).toContain(
      "We couldn't load this movie.",
    );
  });

  it("makes its title the one h1, because the movie title never arrived (AC-18)", () => {
    render(<MovieLoadError />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "We couldn't load this movie.",
      }),
    ).toBeTruthy();
  });

  it("starts with an empty status", () => {
    render(<MovieLoadError />);

    expect(status()?.textContent).toBe("");
  });

  it("renders the page again on the server when Try again is pressed", () => {
    render(<MovieLoadError />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("announces Loading movie and ignores further presses while the refresh runs", async () => {
    let finish!: () => void;
    refresh.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    render(<MovieLoadError />);
    const button = screen.getByRole("button", { name: "Try again" });

    fireEvent.click(button);
    await waitFor(() => expect(status()?.textContent).toBe("Loading movie"));
    fireEvent.click(button);
    fireEvent.click(button);

    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await waitFor(() => expect(status()?.textContent).toBe(""));
  });

  it("can try again after a refresh has finished", async () => {
    render(<MovieLoadError />);
    const button = screen.getByRole("button", { name: "Try again" });

    fireEvent.click(button);
    await waitFor(() => expect(status()?.textContent).toBe(""));
    fireEvent.click(button);

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("writes nothing to the console (AC-16)", () => {
    const spies = (["log", "info", "warn", "error"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    render(<MovieLoadError />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("has no WCAG A or AA violations (AC-18)", async () => {
    const { container } = render(<MovieLoadError />);

    expect(await axeViolations(container)).toEqual([]);
  });
});

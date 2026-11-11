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

// Spec 0008, AC-7: Try again re-runs the server render with `router.refresh()`,
// ignores a second press while it runs, and says so in a polite status.
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { FeedLoadError } from "./feed-load-error";

const status = () => document.querySelector("p[role=status].sr-only");

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);

describe("FeedLoadError (AC-7)", () => {
  it("shows the title, the body and a Try again button", () => {
    render(<FeedLoadError />);

    expect(
      screen.getByRole("heading", { name: "We couldn't load your picks." }),
    ).toBeTruthy();
    expect(
      screen.getByText("Check your connection and try again."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("starts with an empty status", () => {
    render(<FeedLoadError />);

    expect(status()?.textContent).toBe("");
  });

  it("refreshes the page, not just a reset of the failed children, when Try again is pressed", () => {
    render(<FeedLoadError />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("announces Loading your picks and ignores a second press while the refresh runs", async () => {
    let finish!: () => void;
    refresh.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    render(<FeedLoadError />);
    const button = screen.getByRole("button", { name: "Try again" });

    fireEvent.click(button);
    await waitFor(() =>
      expect(status()?.textContent).toBe("Loading your picks"),
    );
    fireEvent.click(button);
    fireEvent.click(button);

    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await waitFor(() => expect(status()?.textContent).toBe(""));
  });

  it("can try again after a refresh has finished", async () => {
    render(<FeedLoadError />);
    const button = screen.getByRole("button", { name: "Try again" });

    fireEvent.click(button);
    await waitFor(() => expect(status()?.textContent).toBe(""));
    fireEvent.click(button);

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

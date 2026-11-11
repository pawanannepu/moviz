// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test-support/axe";
import { LoadMoreBar, type LoadMoreState } from "./load-more-bar";

afterEach(cleanup);

const SIGN_IN = "/sign-in?returnTo=%2Fhome";

function bar(state: LoadMoreState, onLoadMore = vi.fn()) {
  const view = render(
    <LoadMoreBar state={state} onLoadMore={onLoadMore} signInHref={SIGN_IN} />,
  );
  const rerender = (next: LoadMoreState) =>
    view.rerender(
      <LoadMoreBar state={next} onLoadMore={onLoadMore} signInHref={SIGN_IN} />,
    );
  return { ...view, rerender, onLoadMore };
}

describe("LoadMoreBar states (AC-8, AC-9, AC-10)", () => {
  it("shows a Load more picks button when ready", () => {
    bar("idle");

    expect(
      screen.getByRole("button", { name: "Load more picks" }),
    ).toBeTruthy();
    expect(screen.queryByText("That's all for now.")).toBeNull();
  });

  it("calls onLoadMore when the ready button is pressed", () => {
    const { onLoadMore } = bar("idle");

    fireEvent.click(screen.getByRole("button", { name: "Load more picks" }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("shows a busy, aria disabled button while pending, and ignores presses", () => {
    const { onLoadMore } = bar("pending");

    const button = screen.getByRole("button", { name: "Loading more picks" });
    fireEvent.click(button);

    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("shows the failure message and the same button as Try again on error", () => {
    const { onLoadMore } = bar("error");

    expect(
      screen.getByText(
        "We couldn't load more picks. Check your connection and try again.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("shows a Sign in link and the session message when the session ended", () => {
    bar("session_ended");

    expect(
      screen.getByText("Your session ended. Sign in to see more picks."),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
    ).toBe(SIGN_IN);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("replaces the button with the done line when done", () => {
    bar("done");

    expect(screen.getByText("That's all for now.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the message in a polite live region that is empty when there is none", () => {
    const { container } = bar("idle");

    const region = container.querySelector("[role=status]");
    expect(region?.textContent).toBe("");
  });
});

describe("LoadMoreBar focus (AC-9, AC-10)", () => {
  it("moves focus to Try again when pending turns into an error", () => {
    const { rerender } = bar("pending");

    act(() => rerender("error"));

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Try again" }),
    );
  });

  it("moves focus to the Sign in link when pending turns into session ended", () => {
    const { rerender } = bar("pending");

    act(() => rerender("session_ended"));

    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Sign in" }),
    );
  });

  it("moves focus to the done line when pending turns into done", () => {
    const { rerender } = bar("pending");

    act(() => rerender("done"));

    const line = screen.getByText("That's all for now.");
    expect(document.activeElement).toBe(line);
    expect(line.getAttribute("tabindex")).toBe("-1");
  });

  it("does not move focus when it starts out done", () => {
    bar("done");

    expect(document.activeElement).toBe(document.body);
  });

  it("does not move focus when it starts out in an error", () => {
    bar("error");

    expect(document.activeElement).toBe(document.body);
  });

  it("does not move focus on a change that did not come from pending", () => {
    const { rerender } = bar("idle");

    act(() => rerender("done"));

    expect(document.activeElement).toBe(document.body);
  });
});

describe("LoadMoreBar accessibility (AC-15)", () => {
  it.each(["idle", "pending", "error", "session_ended", "done"] as const)(
    "has no WCAG A or AA violations in the %s state",
    async (state) => {
      const { container } = bar(state);

      expect(await axeViolations(container)).toEqual([]);
    },
  );
});

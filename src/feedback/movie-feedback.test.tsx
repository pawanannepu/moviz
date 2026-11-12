// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";

// The controls have their own tests. These cover what the movie page wrapper
// adds: it owns the kind, its own live region, and it tells the kept feed
// about every saved change (spec 0011, AC-11, AC-15).
const setFeedbackAction = vi.fn();
const recordFeedback = vi.fn();
vi.mock("./actions", () => ({
  setFeedbackAction: (...args: unknown[]) => setFeedbackAction(...args),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/movie/7" }));
vi.mock("@/feed/feed-store", () => ({
  useFeedStore: () => ({ recordFeedback }),
}));

import { MovieFeedback } from "./movie-feedback";

const MOVIE = { id: 7, title: "Collateral" };
const status = () => document.querySelector("p[role=status]")?.textContent;

beforeEach(() => {
  vi.resetAllMocks();
  setFeedbackAction.mockImplementation(async ({ kind }: { kind: unknown }) =>
    ok({ kind }),
  );
});
afterEach(cleanup);

describe("MovieFeedback (AC-11, AC-15)", () => {
  it("opens in the hidden state for a movie already marked not interested", () => {
    render(<MovieFeedback movie={MOVIE} initial="not_interested" />);

    expect(screen.getByText("Hidden from your picks.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Undo hiding Collateral" }),
    ).toBeTruthy();
  });

  it("stays on the page when hiding, moves focus to Undo, announces and tells the kept feed", async () => {
    render(<MovieFeedback movie={MOVIE} initial={null} />);

    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Not interested in Collateral" }),
      ),
    );

    const undo = screen.getByRole("button", { name: "Undo hiding Collateral" });
    expect(document.activeElement).toBe(undo);
    expect(status()).toBe("Collateral hidden from your picks");
    expect(recordFeedback).toHaveBeenCalledWith(7, "not_interested");
  });

  it("tells the kept feed about an Undo and a More like this", async () => {
    render(<MovieFeedback movie={MOVIE} initial="not_interested" />);

    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Undo hiding Collateral" }),
      ),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "More like this: Collateral" }),
      ),
    );

    expect(recordFeedback.mock.calls).toEqual([
      [7, null],
      [7, "more_like_this"],
    ]);
    expect(
      screen
        .getByRole("button", { name: "More like this: Collateral" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("does not touch the kept feed when the save fails", async () => {
    setFeedbackAction.mockResolvedValue(err({ code: "db_unavailable" }));
    render(<MovieFeedback movie={MOVIE} initial={null} />);

    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "More like this: Collateral" }),
      ),
    );

    expect(recordFeedback).not.toHaveBeenCalled();
    expect(status()).toBe("");
  });
});

// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT_MS } from "./constants";
import type { SwipeCardMovie } from "./swipe-card";
import { SwipeDeck } from "./swipe-deck";

const heat: SwipeCardMovie = {
  id: 1,
  title: "Heat",
  releaseYear: 1995,
  posterPath: "/heat.jpg",
};
const collateral: SwipeCardMovie = {
  id: 2,
  title: "Collateral",
  releaseYear: 2004,
  posterPath: "/collateral.jpg",
};

function reduceMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches: reduce }));
}

beforeEach(() => {
  vi.useFakeTimers();
  reduceMotion(false);
  Object.defineProperty(HTMLImageElement.prototype, "complete", {
    configurable: true,
    get: () => false,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLImageElement.prototype, "complete");
});

function setUp(movie: SwipeCardMovie | null = heat) {
  const onDecide = vi.fn();
  const view = render(<SwipeDeck movie={movie} onDecide={onDecide} />);
  const next = (to: SwipeCardMovie | null, pending = false) =>
    view.rerender(
      <SwipeDeck movie={to} onDecide={onDecide} pending={pending} />,
    );
  return { onDecide, next, ...view };
}

describe("SwipeDeck live region (AC-12)", () => {
  it("has a polite live region that stays mounted across cards", () => {
    const { next } = setUp();
    const region = screen.getByRole("status");

    expect(region.getAttribute("aria-live")).toBe("polite");

    fireEvent.click(screen.getByRole("button", { name: "Like" }));
    next(collateral);
    act(() => vi.advanceTimersByTime(EXIT_MS));

    expect(screen.getByRole("status")).toBe(region);
  });

  it("announces each choice outside the card", () => {
    setUp();

    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    const region = screen.getByRole("status");
    expect(region.textContent).toBe("Liked Heat");
    expect(screen.getByRole("group").contains(region)).toBe(false);
  });
});

describe("SwipeDeck after a decision (AC-12)", () => {
  it("keeps the old card until its exit has finished, then shows the next", () => {
    const { next } = setUp();

    fireEvent.click(screen.getByRole("button", { name: "Like" }));
    next(collateral, true);

    expect(screen.getByRole("group").getAttribute("aria-label")).toBe(
      "Heat, 1995",
    );

    act(() => vi.advanceTimersByTime(EXIT_MS - 1));
    expect(screen.getByRole("group").getAttribute("aria-label")).toBe(
      "Heat, 1995",
    );

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("group").getAttribute("aria-label")).toBe(
      "Collateral, 2004",
    );
  });

  it("moves focus to the same button on the new card after a button press", () => {
    const { next } = setUp();

    fireEvent.click(screen.getByRole("button", { name: "Not seen" }));
    next(collateral);
    act(() => vi.advanceTimersByTime(EXIT_MS));

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Not seen" }),
    );
    expect(screen.getByRole("group").getAttribute("aria-label")).toBe(
      "Collateral, 2004",
    );
  });

  it("moves focus to the new card after a key press", () => {
    const { next } = setUp();

    fireEvent.keyDown(screen.getByRole("group"), { key: "ArrowRight" });
    next(collateral);
    act(() => vi.advanceTimersByTime(EXIT_MS));

    expect(document.activeElement).toBe(screen.getByRole("group"));
    expect(screen.getByRole("group").getAttribute("aria-label")).toBe(
      "Collateral, 2004",
    );
  });

  it("scales the next card in, but not the first one", () => {
    const { next } = setUp();
    expect(screen.getByRole("group").getAttribute("data-enter")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Like" }));
    next(collateral);
    act(() => vi.advanceTimersByTime(EXIT_MS));

    expect(screen.getByRole("group").getAttribute("data-enter")).toBe(
      "advance",
    );
  });

  it("shows the next card straight away with reduced motion", () => {
    reduceMotion(true);
    const { next } = setUp();

    fireEvent.click(screen.getByRole("button", { name: "Like" }));
    next(collateral);
    act(() => vi.advanceTimersByTime(0));

    expect(screen.getByRole("group").getAttribute("aria-label")).toBe(
      "Collateral, 2004",
    );
  });

  it("still decides with reduced motion", () => {
    reduceMotion(true);
    const { onDecide } = setUp();

    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    expect(onDecide).toHaveBeenCalledWith("liked");
  });

  it("swaps at once when the movie changes with no decision", () => {
    const { next } = setUp();

    next(collateral);
    act(() => vi.advanceTimersByTime(0));

    expect(screen.getByRole("group").getAttribute("aria-label")).toBe(
      "Collateral, 2004",
    );
  });

  it("keeps the same card when a save fails, and the card returns", () => {
    const { next } = setUp();

    fireEvent.click(screen.getByRole("button", { name: "Like" }));
    next(heat, true);
    next(heat, false);
    act(() => vi.advanceTimersByTime(EXIT_MS));

    const card = screen.getByRole("group");
    expect(card.getAttribute("aria-label")).toBe("Heat, 1995");
    expect(
      card
        .querySelector('[data-slot="swipe-poster"]')
        ?.getAttribute("data-exit"),
    ).toBeNull();
  });

  it("shows the empty content when there is no movie", () => {
    render(
      <SwipeDeck movie={null} onDecide={vi.fn()} empty={<p>All done</p>} />,
    );

    expect(screen.getByText("All done")).toBeTruthy();
    expect(screen.queryByRole("group")).toBeNull();
  });
});

describe("SwipeDeck onAnnounce (spec 0006, AC-4, AC-12)", () => {
  it("hands the announcement to the screen and renders no live region of its own", () => {
    const onAnnounce = vi.fn();
    render(
      <SwipeDeck movie={heat} onDecide={vi.fn()} onAnnounce={onAnnounce} />,
    );

    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    expect(onAnnounce).toHaveBeenCalledTimes(1);
    expect(onAnnounce).toHaveBeenCalledWith("Liked Heat");
  });

  it("keeps its own live region when no onAnnounce is given", () => {
    render(<SwipeDeck movie={heat} onDecide={vi.fn()} />);

    expect(screen.getByRole("status")).toBeTruthy();
  });
});

describe("SwipeDeck initialFocus (spec 0006, AC-12)", () => {
  it("puts focus on the first card when asked to, as after an undo", () => {
    render(<SwipeDeck movie={heat} onDecide={vi.fn()} initialFocus="card" />);

    expect(document.activeElement).toBe(screen.getByRole("group"));
  });

  it("puts focus on a named button when asked to", () => {
    render(<SwipeDeck movie={heat} onDecide={vi.fn()} initialFocus="liked" />);

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Like" }),
    );
  });

  it("leaves focus alone when no initial focus is given", () => {
    render(<SwipeDeck movie={heat} onDecide={vi.fn()} />);

    expect(document.activeElement).toBe(document.body);
  });

  it("applies only to the first card: the next card follows the last decision", () => {
    const view = render(
      <SwipeDeck movie={heat} onDecide={vi.fn()} initialFocus="card" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Not seen" }));
    view.rerender(
      <SwipeDeck movie={collateral} onDecide={vi.fn()} initialFocus="card" />,
    );
    act(() => vi.advanceTimersByTime(EXIT_MS));

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Not seen" }),
    );
  });
});

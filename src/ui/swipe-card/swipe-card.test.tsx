// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SwipeChoice } from "@/ratings/swipe-score";
import { SwipeCard, type SwipeCardMovie } from "./swipe-card";

const heat: SwipeCardMovie = {
  id: 1,
  title: "Heat",
  releaseYear: 1995,
  posterPath: "/heat.jpg",
};

beforeEach(() => {
  // A real browser reports an image that is still loading as not complete.
  Object.defineProperty(HTMLImageElement.prototype, "complete", {
    configurable: true,
    get: () => false,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLImageElement.prototype, "complete");
});

function setUp(props: { pending?: boolean } = {}) {
  const onDecide = vi.fn();
  const announce = vi.fn();
  const view = render(
    <SwipeCard
      movie={heat}
      onDecide={onDecide}
      announce={announce}
      pending={props.pending}
    />,
  );
  const card = screen.getByRole("group");
  const poster = card.querySelector(
    '[data-slot="swipe-poster"]',
  ) as HTMLElement;
  return { ...view, onDecide, announce, card, poster };
}

describe("SwipeCard buttons (AC-10)", () => {
  it("always shows three labelled buttons in the order Dislike, Not seen, Like", () => {
    setUp();
    const names = screen
      .getAllByRole("button")
      .map((button) => button.textContent);

    expect(names).toEqual(["Dislike", "Not seen", "Like"]);
  });

  it.each([
    ["Dislike", "disliked"],
    ["Not seen", "not_seen"],
    ["Like", "liked"],
  ] as const)("the %s button calls onDecide once with %s", (name, choice) => {
    const { onDecide } = setUp();

    fireEvent.click(screen.getByRole("button", { name }));

    expect(onDecide).toHaveBeenCalledTimes(1);
    expect(onDecide).toHaveBeenCalledWith(choice, "button");
  });

  it("ignores a second press while the first decision is under way", () => {
    const { onDecide } = setUp();

    fireEvent.click(screen.getByRole("button", { name: "Like" }));
    fireEvent.click(screen.getByRole("button", { name: "Dislike" }));
    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    expect(onDecide).toHaveBeenCalledTimes(1);
  });

  it("announces the choice", () => {
    const { announce } = setUp();

    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    expect(announce).toHaveBeenCalledWith("Liked Heat");
  });
});

describe("SwipeCard poster (AC-8)", () => {
  it("shows the w500 poster with the alt text 'Poster for {title}'", () => {
    setUp();
    const poster = screen.getByRole("img", { name: "Poster for Heat" });

    expect(poster.getAttribute("src")).toBe(
      "https://image.tmdb.org/t/p/w500/heat.jpg",
    );
  });
});

describe("SwipeCard keyboard and semantics (AC-12)", () => {
  it("is a group named with the title and year, described by the visible hint", () => {
    const { card } = setUp();
    const hint = document.getElementById(
      card.getAttribute("aria-describedby") ?? "",
    );

    expect(card.getAttribute("aria-label")).toBe("Heat, 1995");
    expect(hint?.textContent).toBe("Use arrow keys or the buttons");
    expect(card.getAttribute("aria-keyshortcuts")).toBe(
      "ArrowLeft ArrowRight ArrowUp",
    );
    expect(card.getAttribute("tabindex")).toBe("0");
  });

  it("is named with the title alone when the year is unknown", () => {
    render(
      <SwipeCard
        movie={{ ...heat, releaseYear: null }}
        onDecide={vi.fn()}
        announce={vi.fn()}
      />,
    );

    expect(screen.getByRole("group").getAttribute("aria-label")).toBe("Heat");
  });

  it.each([
    ["ArrowRight", "liked", "Liked Heat"],
    ["ArrowLeft", "disliked", "Disliked Heat"],
    ["ArrowUp", "not_seen", "Marked Heat as not seen"],
  ] as const)("%s decides %s and announces it", (key, choice, message) => {
    const { card, onDecide, announce } = setUp();

    fireEvent.keyDown(card, { key });

    expect(onDecide).toHaveBeenCalledTimes(1);
    expect(onDecide).toHaveBeenCalledWith(choice, "key");
    expect(announce).toHaveBeenCalledWith(message);
  });

  it("does not let ArrowUp scroll the page", () => {
    const { card } = setUp();

    // fireEvent returns false when the handler called preventDefault.
    expect(fireEvent.keyDown(card, { key: "ArrowUp" })).toBe(false);
  });

  it("leaves other keys alone", () => {
    const { card, onDecide } = setUp();

    expect(fireEvent.keyDown(card, { key: "ArrowDown" })).toBe(true);
    expect(fireEvent.keyDown(card, { key: "a" })).toBe(true);
    expect(onDecide).not.toHaveBeenCalled();
  });

  it("ignores arrow keys with a modifier, such as browser back", () => {
    const { card, onDecide } = setUp();

    fireEvent.keyDown(card, { key: "ArrowLeft", altKey: true });

    expect(onDecide).not.toHaveBeenCalled();
  });

  it("ignores arrow keys pressed while a button inside has focus", () => {
    const { onDecide } = setUp();

    fireEvent.keyDown(screen.getByRole("button", { name: "Like" }), {
      key: "ArrowRight",
    });

    expect(onDecide).not.toHaveBeenCalled();
  });

  it("decides once when a key is pressed twice quickly", () => {
    const { card, onDecide } = setUp();

    fireEvent.keyDown(card, { key: "ArrowRight" });
    fireEvent.keyDown(card, { key: "ArrowRight" });

    expect(onDecide).toHaveBeenCalledTimes(1);
  });

  it("ignores a held key", () => {
    const { card, onDecide } = setUp();

    fireEvent.keyDown(card, { key: "ArrowRight", repeat: true });

    expect(onDecide).not.toHaveBeenCalled();
  });

  it("ignores all input while the parent is saving", () => {
    const { card, onDecide } = setUp({ pending: true });

    fireEvent.keyDown(card, { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    expect(onDecide).not.toHaveBeenCalled();
  });

  it("returns the card when the save fails, and takes input again", () => {
    const onDecide = vi.fn();
    const props = { movie: heat, onDecide, announce: vi.fn() };
    const { rerender } = render(<SwipeCard {...props} pending={false} />);
    const poster = () =>
      screen.getByRole("group").querySelector('[data-slot="swipe-poster"]');

    fireEvent.click(screen.getByRole("button", { name: "Like" }));
    expect(poster()?.getAttribute("data-exit")).toBe("right");

    rerender(<SwipeCard {...props} pending />);
    rerender(<SwipeCard {...props} pending={false} />);

    expect(poster()?.getAttribute("data-exit")).toBeNull();
    expect(poster()?.getAttribute("data-phase")).toBe("idle");

    fireEvent.click(screen.getByRole("button", { name: "Dislike" }));
    expect(onDecide).toHaveBeenCalledTimes(2);
    expect(onDecide).toHaveBeenLastCalledWith("disliked", "button");
  });

  it("stays out of the way when the parent never reports a save", () => {
    const { poster } = setUp();

    fireEvent.click(screen.getByRole("button", { name: "Not seen" }));

    expect(poster.getAttribute("data-exit")).toBe("up");
  });
});

describe("SwipeCard drag (AC-11)", () => {
  function drag(
    poster: HTMLElement,
    moves: [number, number][],
    pointerType = "mouse",
  ) {
    const base = { pointerId: 7, pointerType, button: 0 };
    fireEvent.pointerDown(poster, { ...base, clientX: 200, clientY: 300 });
    for (const [x, y] of moves) {
      vi.advanceTimersByTime(40);
      fireEvent.pointerMove(poster, {
        ...base,
        clientX: 200 + x,
        clientY: 300 + y,
      });
    }
    return base;
  }

  beforeEach(() => vi.useFakeTimers());

  it.each([
    [
      "right",
      [
        [60, 0],
        [130, 4],
      ],
      "liked",
    ],
    [
      "left",
      [
        [-60, 0],
        [-130, -4],
      ],
      "disliked",
    ],
    [
      "up",
      [
        [0, -60],
        [2, -130],
      ],
      "not_seen",
    ],
  ] as [string, [number, number][], SwipeChoice][])(
    "committing a drag %s decides %s",
    (_direction, moves, choice) => {
      const { poster, onDecide } = setUp();
      const base = drag(poster, moves);

      fireEvent.pointerUp(poster, {
        ...base,
        clientX: 200 + (moves.at(-1)?.[0] ?? 0),
        clientY: 300 + (moves.at(-1)?.[1] ?? 0),
      });

      expect(onDecide).toHaveBeenCalledTimes(1);
      expect(onDecide).toHaveBeenCalledWith(choice, "drag");
    },
  );

  it.each(["mouse", "touch", "pen"])(
    "works with a %s pointer",
    (pointerType) => {
      const { poster, onDecide } = setUp();
      const base = drag(
        poster,
        [
          [60, 0],
          [140, 0],
        ],
        pointerType,
      );

      fireEvent.pointerUp(poster, { ...base, clientX: 340, clientY: 300 });

      expect(onDecide).toHaveBeenCalledWith("liked", "drag");
    },
  );

  it("returns the card after a short, slow drag", () => {
    const { poster, onDecide } = setUp();
    const base = drag(poster, [
      [20, 0],
      [30, 0],
      [40, 0],
    ]);
    vi.advanceTimersByTime(300);

    fireEvent.pointerUp(poster, { ...base, clientX: 240, clientY: 300 });

    expect(onDecide).not.toHaveBeenCalled();
    expect(poster.getAttribute("data-phase")).toBe("idle");
    expect(poster.getAttribute("data-exit")).toBeNull();
  });

  it("returns the card when the pointer is canceled", () => {
    const { poster, onDecide } = setUp();
    const base = drag(poster, [
      [60, 0],
      [140, 0],
    ]);

    fireEvent.pointerCancel(poster, { ...base, clientX: 340, clientY: 300 });

    expect(onDecide).not.toHaveBeenCalled();
    expect(poster.getAttribute("data-phase")).toBe("idle");
  });

  it("never commits a drag down", () => {
    const { poster, onDecide } = setUp();
    const base = drag(poster, [
      [0, 60],
      [0, 200],
    ]);

    fireEvent.pointerUp(poster, { ...base, clientX: 200, clientY: 500 });

    expect(onDecide).not.toHaveBeenCalled();
  });

  it("does not start a drag for a tiny movement", () => {
    const { poster } = setUp();

    drag(poster, [[5, 3]]);

    expect(poster.getAttribute("data-phase")).toBe("idle");
  });

  it("shows the pending action word once the drag is far enough", () => {
    const { poster } = setUp();

    drag(poster, [[20, 0]]);
    expect(poster.querySelector("p[aria-hidden]")).toBeNull();

    drag(poster, [[60, 0]]);
    expect(poster.querySelector("p[aria-hidden]")?.textContent).toBe("Like");
  });

  it("shows Dislike and Not seen for the other directions", () => {
    const left = setUp();
    drag(left.poster, [[-60, 0]]);
    expect(left.poster.querySelector("p[aria-hidden]")?.textContent).toBe(
      "Dislike",
    );
    cleanup();

    const up = setUp();
    drag(up.poster, [[0, -60]]);
    expect(up.poster.querySelector("p[aria-hidden]")?.textContent).toBe(
      "Not seen",
    );
  });

  it("follows the pointer and tilts while dragging", () => {
    const { poster } = setUp();

    drag(poster, [[96, 0]]);

    expect(poster.getAttribute("data-phase")).toBe("dragging");
    expect(poster.style.transform).toContain("translate3d(96px, 0px, 0)");
    expect(poster.style.transform).toContain("rotate(8deg)");
  });

  it("ignores a drag that starts while a decision is under way", () => {
    const { poster, onDecide } = setUp();
    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    const base = drag(poster, [
      [60, 0],
      [140, 0],
    ]);
    fireEvent.pointerUp(poster, { ...base, clientX: 340, clientY: 300 });

    expect(onDecide).toHaveBeenCalledTimes(1);
  });

  it("flicks: a short drag at speed commits", () => {
    const { poster, onDecide } = setUp();
    const base = { pointerId: 7, pointerType: "touch", button: 0 };

    fireEvent.pointerDown(poster, { ...base, clientX: 200, clientY: 300 });
    vi.advanceTimersByTime(20);
    fireEvent.pointerMove(poster, { ...base, clientX: 230, clientY: 300 });
    vi.advanceTimersByTime(20);
    fireEvent.pointerMove(poster, { ...base, clientX: 270, clientY: 300 });
    fireEvent.pointerUp(poster, { ...base, clientX: 270, clientY: 300 });

    expect(onDecide).toHaveBeenCalledWith("liked", "drag");
  });
});

describe("SwipeCard focus on mount", () => {
  it("focuses the card when asked", () => {
    render(
      <SwipeCard
        movie={heat}
        onDecide={vi.fn()}
        announce={vi.fn()}
        initialFocus="card"
      />,
    );

    expect(document.activeElement).toBe(screen.getByRole("group"));
  });

  it("focuses a button when asked", () => {
    render(
      <SwipeCard
        movie={heat}
        onDecide={vi.fn()}
        announce={vi.fn()}
        initialFocus="liked"
      />,
    );

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Like" }),
    );
  });

  it("takes no focus when not asked", () => {
    render(<SwipeCard movie={heat} onDecide={vi.fn()} announce={vi.fn()} />);

    expect(document.activeElement).toBe(document.body);
  });
});

// Keeps `act` used for tests that flush effects.
void act;

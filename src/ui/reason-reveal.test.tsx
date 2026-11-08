// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReasonReveal } from "./reason-reveal";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

let callbacks: ObserverCallback[] = [];

function setUp({
  top,
  reducedMotion,
}: {
  top: number;
  reducedMotion: boolean;
}) {
  callbacks = [];
  class FakeObserver {
    constructor(callback: ObserverCallback) {
      callbacks.push(callback);
    }
    observe = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("matchMedia", () => ({ matches: reducedMotion }));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top,
  } as DOMRect);
  window.innerHeight = 800;
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrapper(container: HTMLElement) {
  return container.querySelector("[data-slot-test]")
    ?.parentElement as HTMLElement;
}

describe("ReasonReveal (AC-13, motion moment 2)", () => {
  it("leaves an item that is already in view alone", () => {
    setUp({ top: 100, reducedMotion: false });
    const { container } = render(
      <ReasonReveal>
        <p data-slot-test>reason</p>
      </ReasonReveal>,
    );

    expect(wrapper(container).getAttribute("data-reveal")).toBeNull();
  });

  it("hides an item below the fold, then shows it once it scrolls into view", () => {
    setUp({ top: 1600, reducedMotion: false });
    const { container } = render(
      <ReasonReveal>
        <p data-slot-test>reason</p>
      </ReasonReveal>,
    );

    expect(wrapper(container).getAttribute("data-reveal")).toBe("hidden");

    act(() => callbacks[0]?.([{ isIntersecting: true }]));

    expect(wrapper(container).getAttribute("data-reveal")).toBe("shown");
  });

  it("does not show the item when it is not intersecting yet", () => {
    setUp({ top: 1600, reducedMotion: false });
    const { container } = render(
      <ReasonReveal>
        <p data-slot-test>reason</p>
      </ReasonReveal>,
    );

    act(() => callbacks[0]?.([{ isIntersecting: false }]));

    expect(wrapper(container).getAttribute("data-reveal")).toBe("hidden");
  });

  it("never hides anything with reduced motion", () => {
    setUp({ top: 1600, reducedMotion: true });
    const { container } = render(
      <ReasonReveal>
        <p data-slot-test>reason</p>
      </ReasonReveal>,
    );

    expect(wrapper(container).getAttribute("data-reveal")).toBeNull();
    expect(callbacks).toHaveLength(0);
  });
});

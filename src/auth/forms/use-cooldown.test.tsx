// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCooldown } from "./use-cooldown";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useCooldown (AC-3, AC-11)", () => {
  it("starts at zero", () => {
    const { result } = renderHook(() => useCooldown());

    expect(result.current.remaining).toBe(0);
  });

  it("shows the full wait as soon as it starts", () => {
    const { result } = renderHook(() => useCooldown());

    act(() => result.current.start(60));

    expect(result.current.remaining).toBe(60);
  });

  it("counts down once a second", () => {
    const { result } = renderHook(() => useCooldown());
    act(() => result.current.start(60));

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.remaining).toBe(57);
  });

  it("stops at zero and stays there", () => {
    const { result } = renderHook(() => useCooldown());
    act(() => result.current.start(2));

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.remaining).toBe(0);
  });

  it("restarts from a new wait, such as the one the server sends", () => {
    const { result } = renderHook(() => useCooldown());
    act(() => result.current.start(60));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    act(() => result.current.start(30));

    expect(result.current.remaining).toBe(30);
  });
});

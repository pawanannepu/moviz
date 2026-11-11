// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { axeViolations } from "@/test-support/axe";
import {
  MovieDetailLoading,
  MovieDetailSkeleton,
} from "./movie-detail-skeleton";

// Spec 0010, AC-10 and AC-18: the loading state is a static skeleton plus the
// status text "Loading movie", and it still has its one h1.

afterEach(cleanup);

describe("MovieDetailSkeleton (AC-10)", () => {
  it("is made of blocks that are all hidden from screen readers", () => {
    const { container } = render(<MovieDetailSkeleton />);

    const blocks = container.querySelectorAll('[data-slot="skeleton"]');
    expect(blocks.length).toBeGreaterThan(3);
    for (const block of blocks) {
      expect(block.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("holds no text, no heading and nothing to focus", () => {
    const { container } = render(<MovieDetailSkeleton />);

    expect(container.textContent).toBe("");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelectorAll("a, button, input")).toHaveLength(0);
  });

  it("uses the same two column grid as the movie", () => {
    const { container } = render(<MovieDetailSkeleton />);

    expect(
      container
        .querySelector('[data-slot="movie-detail-skeleton"]')
        ?.classList.contains("detail-grid"),
    ).toBe(true);
  });
});

describe("MovieDetailLoading (AC-10, AC-18)", () => {
  it("says Loading movie in a status for screen readers", () => {
    render(<MovieDetailLoading />);

    expect(screen.getByRole("status").textContent).toBe("Loading movie");
  });

  it("has exactly one h1", () => {
    render(<MovieDetailLoading />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Loading movie" }),
    ).toBeTruthy();
  });

  it("says the words once, not twice", () => {
    const { container } = render(<MovieDetailLoading />);

    expect(container.textContent).toBe("Loading movie");
  });

  it("shows the skeleton", () => {
    const { container } = render(<MovieDetailLoading />);

    expect(
      container.querySelector('[data-slot="movie-detail-skeleton"]'),
    ).not.toBeNull();
  });

  it("has no WCAG A or AA violations", async () => {
    const { container } = render(<MovieDetailLoading />);

    expect(await axeViolations(container)).toEqual([]);
  });
});

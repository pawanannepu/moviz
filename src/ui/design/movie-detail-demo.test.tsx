// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test-support/axe";

// Spec 0010, AC-20: the /design page shows the movie detail view in every
// state, under its own headings.
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn() }) }));

// The view can also show the watchlist controls, whose Server Actions reach
// the database. They are a boundary, so they are replaced here.
vi.mock("@/watchlist/actions", () => ({
  addToWatchlistAction: vi.fn(),
  removeFromWatchlistAction: vi.fn(),
  rateMovieAction: vi.fn(),
}));

import { MovieDetailDemo, SAMPLE_DETAIL } from "./movie-detail-demo";

afterEach(cleanup);

const count = (container: HTMLElement, slot: string) =>
  container.querySelectorAll(`[data-slot="${slot}"]`).length;

describe("MovieDetailDemo (AC-20)", () => {
  it.each([
    "With a reason",
    "Without a reason (a movie you rated or skipped)",
    "No poster",
    "A long title, and no year, runtime, genres, tagline or director",
    "Loading",
    "Not found",
  ])("labels the state: %s", (label) => {
    render(<MovieDetailDemo movie={SAMPLE_DETAIL} />);

    expect(screen.getByText(label)).toBeTruthy();
  });

  it("shows four movies, one skeleton and one not found state", () => {
    const { container } = render(<MovieDetailDemo movie={SAMPLE_DETAIL} />);

    expect(count(container, "movie-detail")).toBe(4);
    expect(count(container, "movie-detail-skeleton")).toBe(1);
    expect(count(container, "movie-not-found")).toBe(1);
  });

  it("shows a reason on two of the movies and none on the other two", () => {
    const { container } = render(<MovieDetailDemo movie={SAMPLE_DETAIL} />);

    const bars = [
      ...container.querySelectorAll('[data-slot="subtitle-bar"]'),
    ].map((bar) => bar.textContent);
    expect(bars).toEqual([
      "Because you loved Heat (1995)",
      "Popular with film fans",
    ]);
  });

  it("shows the no poster case with the title frame even when the movie has a poster", () => {
    const { container } = render(
      <MovieDetailDemo movie={{ ...SAMPLE_DETAIL, posterPath: "/real.jpg" }} />,
    );

    expect(count(container, "poster-fallback")).toBeGreaterThanOrEqual(2);
  });

  it("adds no h1 or h2 to the design page, which has its own", () => {
    render(<MovieDetailDemo movie={SAMPLE_DETAIL} />);

    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(
      screen.getAllByRole("heading", { level: 3, name: "Collateral" }),
    ).toHaveLength(3);
    expect(
      screen.getByRole("heading", { level: 3, name: "Movie not found" }),
    ).toBeTruthy();
  });

  it("holds sample facts that show the cast limit: nine on file, eight shown", () => {
    render(<MovieDetailDemo movie={SAMPLE_DETAIL} />);

    expect(SAMPLE_DETAIL.cast).toHaveLength(9);
    expect(screen.getAllByText("Tom Cruise")).toHaveLength(3);
    expect(screen.queryByText("A ninth name that is never shown")).toBeNull();
  });

  it("has no WCAG A or AA violations", async () => {
    const { container } = render(<MovieDetailDemo movie={SAMPLE_DETAIL} />);

    expect(await axeViolations(container)).toEqual([]);
  });
});

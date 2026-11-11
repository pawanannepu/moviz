// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogMovie } from "@/catalog/read/get-movie";
import { err, ok } from "@/lib/result";

// `loadMoviePage` has its own tests. These tests cover what the page body does
// with each result: the movie, the not found page, or the in page error
// (spec 0010, AC-3, AC-8, AC-9, AC-10, AC-16).
const loadMoviePage = vi.fn();
const refresh = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
});
const { fakeDb } = vi.hoisted(() => ({ fakeDb: { name: "fake-db" } }));

vi.mock("@/db/client", () => ({ db: fakeDb }));
vi.mock("./load-movie-page", () => ({
  loadMoviePage: (...args: unknown[]) => loadMoviePage(...args),
}));
vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  useRouter: () => ({ refresh }),
}));

// The view can also show the watchlist controls, whose Server Actions reach
// the database. They are a boundary, so they are replaced here.
vi.mock("@/watchlist/actions", () => ({
  addToWatchlistAction: vi.fn(),
  removeFromWatchlistAction: vi.fn(),
  rateMovieAction: vi.fn(),
}));

import { MovieDetail } from "./movie-detail";

const heat: CatalogMovie = {
  id: 412,
  title: "Heat",
  originalTitle: null,
  releaseDate: "1995-12-15",
  releaseYear: 1995,
  overview: "A detective hunts a crew of career thieves.",
  tagline: null,
  runtimeMinutes: 170,
  posterPath: null,
  originalLanguage: "en",
  popularity: null,
  voteAverage: null,
  voteCount: null,
  removed: false,
  genres: ["Crime", "Drama"],
  directors: [{ personId: 1, name: "Michael Mann", profilePath: null }],
  cast: [],
};

const INPUT = { userId: "user-1", movieId: 412 };
const show = async () => render(await MovieDetail(INPUT));
const bar = (container: HTMLElement) =>
  container.querySelector('[data-slot="subtitle-bar"]');

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("MovieDetail read (AC-16, AC-17)", () => {
  it("makes one read, for the signed in user and this movie", async () => {
    loadMoviePage.mockResolvedValue(ok({ movie: heat, reason: null }));

    await show();

    expect(loadMoviePage).toHaveBeenCalledTimes(1);
    expect(loadMoviePage).toHaveBeenCalledWith(fakeDb, {
      userId: "user-1",
      movieId: 412,
    });
  });
});

describe("MovieDetail found (AC-4, AC-8)", () => {
  it("shows the movie with its reason on the poster", async () => {
    loadMoviePage.mockResolvedValue(
      ok({ movie: heat, reason: "Because you loved Collateral (2004)" }),
    );

    const { container } = await show();

    expect(
      screen.getByRole("heading", { level: 1, name: "Heat" }),
    ).toBeTruthy();
    expect(bar(container)?.textContent).toBe(
      "Because you loved Collateral (2004)",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the movie with no bar and no error when there is no reason (AC-9)", async () => {
    loadMoviePage.mockResolvedValue(ok({ movie: heat, reason: null }));

    const { container } = await show();

    expect(
      screen.getByRole("heading", { level: 1, name: "Heat" }),
    ).toBeTruthy();
    expect(bar(container)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("MovieDetail not found (AC-3)", () => {
  it("hands an unknown or removed movie to the not found page", async () => {
    loadMoviePage.mockResolvedValue(err({ code: "movie_not_found" }));

    await expect(MovieDetail(INPUT)).rejects.toThrow("404");

    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("does not call the not found page for a movie that was found", async () => {
    loadMoviePage.mockResolvedValue(ok({ movie: heat, reason: null }));

    await show();

    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("MovieDetail load error (AC-10)", () => {
  it("shows the in page error when the movie cannot be read", async () => {
    loadMoviePage.mockResolvedValue(err({ code: "db_unavailable" }));

    await show();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "We couldn't load this movie.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("Check your connection and try again."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("lets a thrown error rise to the page's error boundary", async () => {
    loadMoviePage.mockRejectedValue(new Error("reasonFor failed"));

    await expect(MovieDetail(INPUT)).rejects.toThrow("reasonFor failed");
  });
});

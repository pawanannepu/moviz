import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogMovie } from "@/catalog/read/get-movie";
import type { Db } from "@/db/create-db";
import { err, ok } from "@/lib/result";

// `getMovie` and `reasonFor` have their own database tests (specs 0003 and
// 0010). They are the database boundary here, so they are replaced. These
// tests cover what `loadMoviePage` adds: one read of each, the not found rule,
// the reason sentence, and which failures reach the page (spec 0010, AC-3,
// AC-7, AC-8, AC-9, AC-10, AC-16).
const getMovie = vi.fn();
const reasonFor = vi.fn();
vi.mock("@/catalog/read/get-movie", () => ({
  getMovie: (...args: unknown[]) => getMovie(...args),
}));
vi.mock("@/recommend/reason-for", () => ({
  reasonFor: (...args: unknown[]) => reasonFor(...args),
}));
// The feedback read (spec 0011) decides whether the page shows its controls.
const feedbackFor = vi.fn();
vi.mock("@/feedback/feedback", () => ({
  feedbackFor: (...args: unknown[]) => feedbackFor(...args),
}));

import { loadMoviePage } from "./load-movie-page";

const db = { name: "fake-db" } as unknown as Db;
const INPUT = { userId: "user-secret-7f3a", movieId: 424242 };

function movie(overrides: Partial<CatalogMovie> = {}): CatalogMovie {
  return {
    id: INPUT.movieId,
    title: "Collateral",
    originalTitle: null,
    releaseDate: "2004-08-04",
    releaseYear: 2004,
    overview: "A cab driver has a long night.",
    tagline: "It started like any other night.",
    runtimeMinutes: 120,
    posterPath: "/collateral.jpg",
    originalLanguage: "en",
    popularity: 10,
    voteAverage: 7.5,
    voteCount: 5000,
    removed: false,
    genres: ["Crime", "Drama"],
    directors: [{ personId: 1, name: "Michael Mann", profilePath: null }],
    cast: [],
    ...overrides,
  };
}

const similarTo = (score: number, releaseYear: number | null = 1995) =>
  ok({
    kind: "similar_to_liked" as const,
    anchor: { movieId: 900, title: "Heat", releaseYear, score },
  });

beforeEach(() => {
  vi.resetAllMocks();
  getMovie.mockResolvedValue(ok(movie()));
  reasonFor.mockResolvedValue(similarTo(9));
  feedbackFor.mockResolvedValue(ok(null));
});

describe("loadMoviePage reads (AC-16, AC-17)", () => {
  it("reads the movie once and the reason once", async () => {
    await loadMoviePage(db, INPUT);

    expect(getMovie).toHaveBeenCalledTimes(1);
    expect(reasonFor).toHaveBeenCalledTimes(1);
  });

  it("reads the movie by the id it was given", async () => {
    await loadMoviePage(db, INPUT);

    expect(getMovie).toHaveBeenCalledWith(db, 424242);
  });

  it("asks for the reason of that movie for the user it was given, and nothing else", async () => {
    await loadMoviePage(db, INPUT);

    expect(reasonFor).toHaveBeenCalledWith(db, {
      userId: "user-secret-7f3a",
      movieId: 424242,
    });
  });

  it("starts the reason read without waiting for the movie read", async () => {
    getMovie.mockReturnValue(new Promise(() => {}));

    void loadMoviePage(db, INPUT);
    await Promise.resolve();

    expect(reasonFor).toHaveBeenCalledTimes(1);
  });
});

describe("loadMoviePage result (AC-7, AC-8)", () => {
  it("returns the movie as the catalog gave it", async () => {
    const result = await loadMoviePage(db, INPUT);

    expect(result).toEqual(
      ok({
        movie: movie(),
        reason: "Because you loved Heat (1995)",
        feedback: { kind: null },
      }),
    );
  });

  it.each([
    [10, "Because you loved Heat (1995)"],
    [8, "Because you liked Heat (1995)"],
    [6, "Because you rated Heat (1995)"],
  ])("words a %i as the feed does: %s", async (score, sentence) => {
    reasonFor.mockResolvedValue(similarTo(score));

    const result = await loadMoviePage(db, INPUT);

    expect(result.ok && result.value.reason).toBe(sentence);
  });

  it("leaves the year out of the sentence when the anchor has none", async () => {
    reasonFor.mockResolvedValue(similarTo(9, null));

    const result = await loadMoviePage(db, INPUT);

    expect(result.ok && result.value.reason).toBe("Because you loved Heat");
  });

  it("says Popular with film fans for a popular reason", async () => {
    reasonFor.mockResolvedValue(ok({ kind: "popular" }));

    const result = await loadMoviePage(db, INPUT);

    expect(result.ok && result.value.reason).toBe("Popular with film fans");
  });

  it("has no reason when the recommender gives none (a rated or skipped movie)", async () => {
    reasonFor.mockResolvedValue(ok(null));

    const result = await loadMoviePage(db, INPUT);

    expect(result).toEqual(
      ok({ movie: movie(), reason: null, feedback: null }),
    );
  });

  it("still returns a movie that has no poster", async () => {
    getMovie.mockResolvedValue(ok(movie({ posterPath: null })));
    reasonFor.mockResolvedValue(ok(null));

    const result = await loadMoviePage(db, INPUT);

    expect(result.ok && result.value.movie.posterPath).toBeNull();
  });
});

describe("loadMoviePage not found (AC-3)", () => {
  it("returns movie_not_found for an unknown id", async () => {
    getMovie.mockResolvedValue(err({ code: "movie_not_found" }));
    reasonFor.mockResolvedValue(ok(null));

    expect(await loadMoviePage(db, INPUT)).toEqual(
      err({ code: "movie_not_found" }),
    );
  });

  it("returns movie_not_found for a movie the catalog withdrew", async () => {
    getMovie.mockResolvedValue(ok(movie({ removed: true })));
    reasonFor.mockResolvedValue(ok(null));

    expect(await loadMoviePage(db, INPUT)).toEqual(
      err({ code: "movie_not_found" }),
    );
  });

  it("stays not found even when the reason read failed too", async () => {
    getMovie.mockResolvedValue(err({ code: "movie_not_found" }));
    reasonFor.mockResolvedValue(err({ code: "db_unavailable" }));

    expect(await loadMoviePage(db, INPUT)).toEqual(
      err({ code: "movie_not_found" }),
    );
  });
});

describe("loadMoviePage failures (AC-9, AC-10, AC-16)", () => {
  it("returns db_unavailable when the movie read fails", async () => {
    getMovie.mockResolvedValue(err({ code: "db_unavailable" }));

    expect(await loadMoviePage(db, INPUT)).toEqual(
      err({ code: "db_unavailable" }),
    );
  });

  it("shows the movie with no reason when only the reason read fails (AC-9)", async () => {
    reasonFor.mockResolvedValue(err({ code: "db_unavailable" }));

    expect(await loadMoviePage(db, INPUT)).toEqual(
      ok({ movie: movie(), reason: null, feedback: null }),
    );
  });

  it("throws for an invalid input from the recommender, with no data in the message (AC-16)", async () => {
    reasonFor.mockResolvedValue(err({ code: "invalid_input" }));

    const attempt = loadMoviePage(db, INPUT);

    await expect(attempt).rejects.toThrow(
      "The movie page sent the recommender an invalid input.",
    );
    await attempt.catch((error: Error) => {
      expect(error.message).not.toContain("user-secret-7f3a");
      expect(error.message).not.toContain("424242");
      expect(error.message).not.toContain("Collateral");
    });
  });

  it("lets an unexpected error from the reason read rise to the error page", async () => {
    reasonFor.mockRejectedValue(
      new Error("reasonFor failed: Error (code 42883)"),
    );

    await expect(loadMoviePage(db, INPUT)).rejects.toThrow(
      "reasonFor failed: Error (code 42883)",
    );
  });

  it("lets an unexpected error from the movie read rise to the error page", async () => {
    getMovie.mockRejectedValue(new Error("boom"));

    await expect(loadMoviePage(db, INPUT)).rejects.toThrow("boom");
  });
});

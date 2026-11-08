import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/create-db";
import { err, ok } from "@/lib/result";
import type { HERO_PICKS } from "./hero-picks";
import { loadHeroPick } from "./load-hero-pick";

const matchMovies = vi.fn();
const getMoviesByIds = vi.fn();

vi.mock("@/catalog/match/match-movies", () => ({
  matchMovies: (...args: unknown[]) => matchMovies(...args),
}));
vi.mock("@/catalog/read/get-movie", () => ({
  getMoviesByIds: (...args: unknown[]) => getMoviesByIds(...args),
}));

const db = {} as Db;
const picks: typeof HERO_PICKS = [
  { title: "First", year: 2001, reason: "Because first." },
  { title: "Second", year: 2002, reason: "Because second." },
];

function movie(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Movie ${id}`,
    releaseYear: 2000 + id,
    posterPath: `/p${id}.jpg`,
    removed: false,
    genres: [],
    ...overrides,
  };
}

beforeEach(() => {
  matchMovies.mockReset();
  getMoviesByIds.mockReset();
});

describe("loadHeroPick (AC-15)", () => {
  it("returns the first pick that has a poster", async () => {
    matchMovies.mockResolvedValue(
      ok([
        { kind: "match", movieId: 10 },
        { kind: "match", movieId: 20 },
      ]),
    );
    getMoviesByIds.mockResolvedValue(ok([movie(10), movie(20)]));

    const pick = await loadHeroPick(db, picks);

    expect(pick).toEqual({
      movie: {
        id: 10,
        title: "Movie 10",
        releaseYear: 2010,
        posterPath: "/p10.jpg",
      },
      reason: "Because first.",
    });
  });

  it("matches the picks by title and year, in order", async () => {
    matchMovies.mockResolvedValue(
      ok([{ kind: "no_match" }, { kind: "no_match" }]),
    );

    await loadHeroPick(db, picks);

    expect(matchMovies).toHaveBeenCalledWith(db, [
      { title: "First", year: 2001 },
      { title: "Second", year: 2002 },
    ]);
  });

  it("skips a pick that is not found or is ambiguous", async () => {
    matchMovies.mockResolvedValue(
      ok([{ kind: "ambiguous" }, { kind: "match", movieId: 20 }]),
    );
    getMoviesByIds.mockResolvedValue(ok([movie(20)]));

    const pick = await loadHeroPick(db, picks);

    expect(pick?.movie.id).toBe(20);
    expect(pick?.reason).toBe("Because second.");
  });

  it("skips a movie with no poster and takes the next", async () => {
    matchMovies.mockResolvedValue(
      ok([
        { kind: "match", movieId: 10 },
        { kind: "match", movieId: 20 },
      ]),
    );
    getMoviesByIds.mockResolvedValue(
      ok([movie(10, { posterPath: null }), movie(20)]),
    );

    expect((await loadHeroPick(db, picks))?.movie.id).toBe(20);
  });

  it("skips a movie TMDB no longer returns", async () => {
    matchMovies.mockResolvedValue(
      ok([
        { kind: "match", movieId: 10 },
        { kind: "match", movieId: 20 },
      ]),
    );
    getMoviesByIds.mockResolvedValue(
      ok([movie(10, { removed: true }), movie(20)]),
    );

    expect((await loadHeroPick(db, picks))?.movie.id).toBe(20);
  });

  it("returns null when no pick is found", async () => {
    matchMovies.mockResolvedValue(
      ok([{ kind: "no_match" }, { kind: "ambiguous" }]),
    );
    getMoviesByIds.mockResolvedValue(ok([]));

    expect(await loadHeroPick(db, picks)).toBeNull();
  });

  it("returns null when matching reports the database is unavailable", async () => {
    matchMovies.mockResolvedValue(err({ code: "db_unavailable" }));

    expect(await loadHeroPick(db, picks)).toBeNull();
    expect(getMoviesByIds).not.toHaveBeenCalled();
  });

  it("returns null when reading the movies reports the database is unavailable", async () => {
    matchMovies.mockResolvedValue(ok([{ kind: "match", movieId: 10 }]));
    getMoviesByIds.mockResolvedValue(err({ code: "db_unavailable" }));

    expect(await loadHeroPick(db, picks)).toBeNull();
  });

  it("returns null when the database throws", async () => {
    matchMovies.mockRejectedValue(new Error("connection refused"));

    expect(await loadHeroPick(db, picks)).toBeNull();
  });
});

import { afterAll, describe, expect, it, vi } from "vitest";
import { mapDetails } from "@/catalog/sync/map-details";
import { markMovieRemoved } from "@/catalog/sync/mark-removed";
import { persistMovie } from "@/catalog/sync/persist-movie";
import type { Db } from "@/db/create-db";
import {
  details,
  personIdsOf,
  removeCatalogRows,
} from "@/test-support/catalog-fixtures";
import {
  forbiddenDb,
  TEST_DATABASE_URL,
  token,
  useTestDb,
} from "@/test-support/test-db";
import { matchMovies } from "./match-movies";

describe.skipIf(!TEST_DATABASE_URL)("matchMovies", () => {
  const ctx = useTestDb();
  const tmdbIds: number[] = [];
  const personIds: number[] = [];

  /** Stores one movie through the real write path and returns our movie id. */
  async function store(
    tag: string,
    year: number,
    overrides: Parameters<typeof details>[1] = {},
  ): Promise<number> {
    const movie = details(tag, {
      release_date: `${year}-06-01`,
      ...overrides,
    });
    tmdbIds.push(movie.id);
    personIds.push(...personIdsOf(movie));
    const stored = await persistMovie(ctx.db, mapDetails(movie));
    if (!stored.ok) throw new Error("fixture movie was not stored");
    return stored.value.movieId;
  }

  afterAll(async () => {
    await removeCatalogRows(ctx.db, tmdbIds, personIds);
  });

  it("matches a title and year to the stored movie (AC-4)", async () => {
    const tag = token();
    const id = await store(tag, 1995);

    const result = await matchMovies(ctx.db, [
      { title: `Movie ${tag}`, year: 1995 },
    ]);

    expect(result).toEqual({
      ok: true,
      value: [{ kind: "match", movieId: id }],
    });
  });

  it("matches whatever the case, spacing and punctuation of the title (AC-4)", async () => {
    const tag = token();
    const id = await store(tag, 1995);

    const result = await matchMovies(ctx.db, [
      { title: `  MOVIE:   ${tag.toUpperCase()}! `, year: 1995 },
    ]);

    expect(result).toEqual({
      ok: true,
      value: [{ kind: "match", movieId: id }],
    });
  });

  it("accepts one year before or after, and refuses two (AC-4)", async () => {
    const tag = token();
    const id = await store(tag, 1995);
    const title = `Movie ${tag}`;

    const result = await matchMovies(ctx.db, [
      { title, year: 1994 },
      { title, year: 1996 },
      { title, year: 1993 },
      { title, year: 1997 },
    ]);

    expect(result.ok && result.value.map((o) => o.kind)).toEqual([
      "match",
      "match",
      "no_match",
      "no_match",
    ]);
    expect(result.ok && result.value[0]).toEqual({
      kind: "match",
      movieId: id,
    });
  });

  it("lets the exact year beat a movie one year off (AC-4)", async () => {
    const tag = token();
    const older = await store(tag, 2004, { title: `Movie ${tag}` });
    const newer = await store(tag, 2005, { title: `Movie ${tag}` });
    const title = `Movie ${tag}`;

    const result = await matchMovies(ctx.db, [
      { title, year: 2004 },
      { title, year: 2005 },
    ]);

    expect(result).toEqual({
      ok: true,
      value: [
        { kind: "match", movieId: older },
        { kind: "match", movieId: newer },
      ],
    });
  });

  it("is ambiguous when two movies share a title and year, and guesses nothing (AC-4)", async () => {
    const tag = token();
    await store(tag, 2010, {
      title: `Twin ${tag}`,
      original_title: `Twin ${tag}`,
    });
    await store(tag, 2010, {
      title: `Twin ${tag}`,
      original_title: `Twin ${tag}`,
    });

    const result = await matchMovies(ctx.db, [
      { title: `Twin ${tag}`, year: 2010 },
    ]);

    expect(result).toEqual({ ok: true, value: [{ kind: "ambiguous" }] });
  });

  it("prefers a movie matched by its own title over one matched by an alternate (AC-4)", async () => {
    const tag = token();
    const own = await store(tag, 2012, {
      title: `Shared ${tag}`,
      original_title: `Shared ${tag}`,
    });
    await store(tag, 2012, {
      title: `Other ${tag}`,
      original_title: `Other ${tag}`,
      alternative_titles: { titles: [{ title: `Shared ${tag}` }] },
    });

    const result = await matchMovies(ctx.db, [
      { title: `Shared ${tag}`, year: 2012 },
    ]);

    expect(result).toEqual({
      ok: true,
      value: [{ kind: "match", movieId: own }],
    });
  });

  it("finds a movie through an alternate title (AC-4)", async () => {
    const tag = token();
    const id = await store(tag, 2001, {
      alternative_titles: { titles: [{ title: `Hitze ${tag}` }] },
    });

    const result = await matchMovies(ctx.db, [
      { title: `Hitze ${tag}`, year: 2001 },
    ]);

    expect(result).toEqual({
      ok: true,
      value: [{ kind: "match", movieId: id }],
    });
  });

  it("matches a movie that has no poster (AC-4)", async () => {
    const tag = token();
    const id = await store(tag, 1999, { poster_path: null });

    const result = await matchMovies(ctx.db, [
      { title: `Movie ${tag}`, year: 1999 },
    ]);

    expect(result).toEqual({
      ok: true,
      value: [{ kind: "match", movieId: id }],
    });
  });

  it("never returns a movie that TMDB removed (AC-4, AC-12)", async () => {
    const tag = token();
    const movie = details(tag, { release_date: "2003-03-03" });
    tmdbIds.push(movie.id);
    personIds.push(...personIdsOf(movie));
    await persistMovie(ctx.db, mapDetails(movie));
    await markMovieRemoved(ctx.db, movie.id);

    const result = await matchMovies(ctx.db, [
      { title: `Movie ${tag}`, year: 2003 },
    ]);

    expect(result).toEqual({ ok: true, value: [{ kind: "no_match" }] });
  });

  it("answers no_match without touching the database for rows with no year or an empty key (AC-4)", async () => {
    const result = await matchMovies(forbiddenDb, [
      { title: "Heat", year: null },
      { title: "!!! ???", year: 1995 },
      { title: "", year: 1995 },
      { title: "Heat", year: 1995.5 },
    ]);

    expect(result).toEqual({
      ok: true,
      value: [
        { kind: "no_match" },
        { kind: "no_match" },
        { kind: "no_match" },
        { kind: "no_match" },
      ],
    });
  });

  it("returns one outcome per row in the same order, and the same answer for duplicate rows (AC-4)", async () => {
    const tag = token();
    const id = await store(tag, 2008);
    const row = { title: `Movie ${tag}`, year: 2008 };

    const result = await matchMovies(ctx.db, [
      row,
      { title: `Nothing ${tag}`, year: 2008 },
      row,
    ]);

    expect(result).toEqual({
      ok: true,
      value: [
        { kind: "match", movieId: id },
        { kind: "no_match" },
        { kind: "match", movieId: id },
      ],
    });
  });

  it("returns an empty list for no rows", async () => {
    expect(await matchMovies(forbiddenDb, [])).toEqual({ ok: true, value: [] });
  });

  it("resolves thousands of rows in one query, the same as one row (AC-5)", async () => {
    const tag = token();
    const id = await store(tag, 2015);
    const spy = vi.spyOn(ctx.db, "execute");
    const rows = Array.from({ length: 3000 }, (_, i) => ({
      title: i === 1234 ? `Movie ${tag}` : `Nobody ${tag} ${i}`,
      year: 2015,
    }));

    const result = await matchMovies(ctx.db, rows);

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(result.ok && result.value).toHaveLength(3000);
    expect(result.ok && result.value[1234]).toEqual({
      kind: "match",
      movieId: id,
    });
    expect(result.ok && result.value[0]).toEqual({ kind: "no_match" });
  });

  it("maps a lost connection to db_unavailable (AC-4)", async () => {
    const broken = {
      execute: async () => {
        throw Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        });
      },
    } as unknown as Db;

    const result = await matchMovies(broken, [{ title: "Heat", year: 1995 }]);

    expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
  });

  it("rethrows an error that is not a connection failure", async () => {
    const buggy = {
      execute: async () => {
        throw new Error("syntax error somewhere");
      },
    } as unknown as Db;

    await expect(
      matchMovies(buggy, [{ title: "Heat", year: 1995 }]),
    ).rejects.toThrow("syntax error somewhere");
  });
});

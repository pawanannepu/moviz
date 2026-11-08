import { afterAll, describe, expect, it, vi } from "vitest";
import { mapDetails } from "@/catalog/sync/map-details";
import { markMovieRemoved } from "@/catalog/sync/mark-removed";
import { persistMovie } from "@/catalog/sync/persist-movie";
import type { Db } from "@/db/create-db";
import {
  details,
  newPersonId,
  personIdsOf,
  removeCatalogRows,
} from "@/test-support/catalog-fixtures";
import {
  TEST_DATABASE_URL,
  token,
  UNKNOWN_MOVIE_ID,
  useTestDb,
} from "@/test-support/test-db";
import { getMovie, getMoviesByIds } from "./get-movie";

describe.skipIf(!TEST_DATABASE_URL)("catalog read functions", () => {
  const ctx = useTestDb();
  const tmdbIds: number[] = [];
  const personIds: number[] = [];

  async function store(
    tag: string,
    overrides: Parameters<typeof details>[1] = {},
  ) {
    const movie = details(tag, overrides);
    tmdbIds.push(movie.id);
    personIds.push(...personIdsOf(movie));
    const stored = await persistMovie(ctx.db, mapDetails(movie));
    if (!stored.ok) throw new Error("fixture movie was not stored");
    return { id: stored.value.movieId, tmdbId: movie.id, movie };
  }

  afterAll(async () => {
    await removeCatalogRows(ctx.db, tmdbIds, personIds);
  });

  describe("getMovie (AC-6)", () => {
    it("returns the movie with its fields, genres, directors and cast", async () => {
      const tag = token();
      const { id } = await store(tag);

      const result = await getMovie(ctx.db, id);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toMatchObject({
        id,
        title: `Movie ${tag}`,
        releaseDate: "2001-05-05",
        releaseYear: 2001,
        overview: `An overview for ${tag}.`,
        tagline: `A tagline for ${tag}`,
        runtimeMinutes: 100,
        posterPath: expect.stringContaining("/poster-"),
        originalLanguage: "en",
        voteCount: 1000,
        removed: false,
      });
      expect(result.value.directors.map((d) => d.name)).toEqual([
        `Director ${tag}`,
      ]);
      expect(result.value.cast.map((c) => c.name)).toEqual([`Actor ${tag}`]);
      expect(result.value.cast[0].characterName).toBe("Lead");
    });

    it("lists genres alphabetically", async () => {
      const { id } = await store(token(), {
        genres: [
          { id: 1, name: "Western" },
          { id: 2, name: "Action" },
          { id: 3, name: "Drama" },
        ],
      });

      const result = await getMovie(ctx.db, id);

      expect(result.ok && result.value.genres).toEqual([
        "Action",
        "Drama",
        "Western",
      ]);
    });

    it("lists the cast in billing order, not the order they were stored", async () => {
      const cast = [3, 0, 2, 1].map((order) => ({
        id: newPersonId(),
        name: `Billed ${order}`,
        character: `Role ${order}`,
        order,
        profile_path: null,
      }));
      const { id } = await store(token(), {
        credits: { cast, crew: [] },
      });

      const result = await getMovie(ctx.db, id);

      expect(result.ok && result.value.cast.map((c) => c.name)).toEqual([
        "Billed 0",
        "Billed 1",
        "Billed 2",
        "Billed 3",
      ]);
    });

    it("returns movie_not_found for an unknown id", async () => {
      const result = await getMovie(ctx.db, UNKNOWN_MOVIE_ID);

      expect(result).toEqual({
        ok: false,
        error: { code: "movie_not_found" },
      });
    });

    it("returns a removed movie with removed true and empty lists", async () => {
      const tag = token();
      const { id, tmdbId } = await store(tag);
      await markMovieRemoved(ctx.db, tmdbId);

      const result = await getMovie(ctx.db, id);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toMatchObject({
        id,
        title: `Movie ${tag}`,
        releaseDate: "2001-05-05",
        removed: true,
        overview: null,
        posterPath: null,
        genres: [],
        directors: [],
        cast: [],
      });
    });

    it("maps a lost connection to db_unavailable", async () => {
      const broken = {
        select: () => {
          throw Object.assign(new Error("connection reset"), {
            code: "ECONNRESET",
          });
        },
      } as unknown as Db;

      expect(await getMovie(broken, 1)).toEqual({
        ok: false,
        error: { code: "db_unavailable" },
      });
    });
  });

  describe("getMoviesByIds (AC-6)", () => {
    it("returns results in the order asked and leaves unknown ids out", async () => {
      const a = await store(token());
      const b = await store(token());
      const c = await store(token());

      const result = await getMoviesByIds(ctx.db, [
        c.id,
        UNKNOWN_MOVIE_ID,
        a.id,
        b.id,
      ]);

      expect(result.ok && result.value.map((m) => m.id)).toEqual([
        c.id,
        a.id,
        b.id,
      ]);
    });

    it("returns an empty list for no ids without a query", async () => {
      const spy = vi.spyOn(ctx.db, "select");

      const result = await getMoviesByIds(ctx.db, []);

      expect(result).toEqual({ ok: true, value: [] });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("uses at most three queries however many ids are asked for", async () => {
      const movies = await Promise.all(
        Array.from({ length: 6 }, () => store(token())),
      );
      const spy = vi.spyOn(ctx.db, "select");

      const result = await getMoviesByIds(
        ctx.db,
        movies.map((m) => m.id),
      );

      expect(result.ok && result.value).toHaveLength(6);
      expect(spy.mock.calls.length).toBeLessThanOrEqual(3);
      spy.mockRestore();
    });

    it("gives each movie its own genres and cast", async () => {
      const a = await store(token(), {
        genres: [{ id: 1, name: "Horror" }],
      });
      const b = await store(token(), {
        genres: [{ id: 2, name: "Comedy" }],
      });

      const result = await getMoviesByIds(ctx.db, [a.id, b.id]);

      expect(result.ok && result.value[0].genres).toEqual(["Horror"]);
      expect(result.ok && result.value[1].genres).toEqual(["Comedy"]);
      expect(result.ok && result.value[0].cast[0].name).toBe(
        a.movie.credits?.cast?.[0].name,
      );
    });

    it("mixes live and removed movies, with lists only on the live one", async () => {
      const live = await store(token());
      const gone = await store(token());
      await markMovieRemoved(ctx.db, gone.tmdbId);

      const result = await getMoviesByIds(ctx.db, [gone.id, live.id]);

      expect(result.ok && result.value.map((m) => m.removed)).toEqual([
        true,
        false,
      ]);
      expect(result.ok && result.value[0].cast).toEqual([]);
      expect(result.ok && result.value[1].cast).toHaveLength(1);
    });
  });
});

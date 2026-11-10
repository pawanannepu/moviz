import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { movies } from "@/db/schema";
import {
  TEST_DATABASE_URL,
  UNKNOWN_MOVIE_ID,
  useTestDb,
} from "@/test-support/test-db";
import { isMovieListable } from "./is-movie-listable";

describe.skipIf(!TEST_DATABASE_URL)("isMovieListable (database)", () => {
  const t = useTestDb();

  async function movieWith(patch: Partial<typeof movies.$inferInsert>) {
    const [row] = await t.fx.newMovies(1);
    await t.db.update(movies).set(patch).where(eq(movies.id, row.id));
    return row;
  }

  it("is true for a movie that has a poster and is still returned by TMDB (AC-3)", async () => {
    const row = await movieWith({ posterPath: "/poster.jpg" });

    const result = await isMovieListable(t.db, { movieId: row.id });

    expect(result).toEqual({ ok: true, value: true });
  });

  it("is false for a movie the catalog marked missing, though its row is still there (AC-3, AC-10)", async () => {
    const row = await movieWith({
      posterPath: "/poster.jpg",
      sourceMissingAt: new Date(),
    });

    const result = await isMovieListable(t.db, { movieId: row.id });

    expect(result).toEqual({ ok: true, value: false });
  });

  it("is false for a movie with no poster (AC-3)", async () => {
    const row = await movieWith({ posterPath: null });

    const result = await isMovieListable(t.db, { movieId: row.id });

    expect(result).toEqual({ ok: true, value: false });
  });

  it("is false for a movie that does not exist (AC-3, AC-10)", async () => {
    const result = await isMovieListable(t.db, { movieId: UNKNOWN_MOVIE_ID });

    expect(result).toEqual({ ok: true, value: false });
  });
});

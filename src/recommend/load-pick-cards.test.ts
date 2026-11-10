import { describe, expect, it } from "vitest";
import { useRecommendFixtures } from "@/test-support/recommend-fixtures";
import {
  forbiddenDb,
  TEST_DATABASE_URL,
  useTestDb,
} from "@/test-support/test-db";
import { loadPickCards } from "./load-pick-cards";

describe.skipIf(!TEST_DATABASE_URL)("loadPickCards", () => {
  const ctx = useTestDb();
  const fx = useRecommendFixtures(() => ctx.db);

  it("returns the card fields a feed card needs", async () => {
    const movieId = await fx.addMovie({ releaseDate: "1995-12-15" });

    const [card] = await loadPickCards(ctx.db, [movieId]);

    expect(card).toMatchObject({ id: movieId, releaseYear: 1995 });
    expect(card.title).toMatch(/^Rec Test /);
    expect(card.posterPath).toMatch(/^\/rec-/);
    expect(Object.keys(card).sort()).toEqual([
      "genres",
      "id",
      "posterPath",
      "releaseYear",
      "title",
    ]);
  });

  it("returns the cards in the order of the ids, not in id order", async () => {
    const [first, second, third] = await fx.addMovies([{}, {}, {}]);

    const cards = await loadPickCards(ctx.db, [third, first, second]);

    expect(cards.map((card) => card.id)).toEqual([third, first, second]);
  });

  it("gives genre names sorted alphabetically", async () => {
    const movieId = await fx.addMovie();
    const names = await fx.addGenres(movieId, 3);

    const [card] = await loadPickCards(ctx.db, [movieId]);

    expect(card.genres).toEqual([...names].sort());
    expect(card.genres).toHaveLength(3);
  });

  it("gives an empty list of genres for a movie with none", async () => {
    const movieId = await fx.addMovie();

    const [card] = await loadPickCards(ctx.db, [movieId]);

    expect(card.genres).toEqual([]);
  });

  it("gives a null release year when the movie has no release date", async () => {
    const movieId = await fx.addMovie({ releaseDate: null });

    const [card] = await loadPickCards(ctx.db, [movieId]);

    expect(card.releaseYear).toBeNull();
  });

  it("does not repeat a movie that has several genres", async () => {
    const [withGenres, plain] = await fx.addMovies([{}, {}]);
    await fx.addGenres(withGenres, 4);

    const cards = await loadPickCards(ctx.db, [withGenres, plain]);

    expect(cards.map((card) => card.id)).toEqual([withGenres, plain]);
  });

  it("drops a movie that is no longer listable and an id that does not exist", async () => {
    const [listed, noPoster, removed] = await fx.addMovies([
      {},
      { poster: false },
      { removed: true },
    ]);

    const cards = await loadPickCards(ctx.db, [
      noPoster,
      listed,
      removed,
      4_503_599_627_370_000,
    ]);

    expect(cards.map((card) => card.id)).toEqual([listed]);
  });

  it("returns an empty list for no ids without reading the database", async () => {
    const cards = await loadPickCards(forbiddenDb, []);

    expect(cards).toEqual([]);
  });
});

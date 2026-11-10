import { describe, expect, it } from "vitest";
import { orderDeck } from "./order-deck";

const movie = (id: number, ...genreIds: number[]) => ({ id, genreIds });

describe("orderDeck (AC-2)", () => {
  it("returns nothing for an empty pool", () => {
    expect(orderDeck([])).toEqual([]);
  });

  it("keeps vote order when no movie shares a genre", () => {
    const pool = [movie(1, 1), movie(2, 2), movie(3, 3)];
    expect(orderDeck(pool).map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("takes the first remaining movie that shares no genre with the previous two", () => {
    const pool = [
      movie(1, 1), // first card
      movie(2, 1), // shares with 1, pushed back
      movie(3, 2), // first without genre 1
      movie(4, 1), // shares with 1, still blocked by the window of two
      movie(5, 3),
    ];
    // 1, then 3 (no genre 1), then 2? 2 has genre 1, blocked by card 1 in window; 4 same; 5 qualifies.
    expect(orderDeck(pool).map((m) => m.id)).toEqual([1, 3, 5, 2, 4]);
  });

  it("falls back to the first remaining movie when none qualifies", () => {
    const pool = [movie(1, 1), movie(2, 1), movie(3, 1)];
    expect(orderDeck(pool).map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("treats a movie with no genres as always fitting", () => {
    const pool = [movie(1, 1), movie(2, 1), movie(3)];
    expect(orderDeck(pool).map((m) => m.id)).toEqual([1, 3, 2]);
  });

  it("is stable: the same pool gives the same order, and nothing is lost", () => {
    const pool = Array.from({ length: 60 }, (_, i) =>
      movie(i + 1, (i % 5) + 1, ((i * 3) % 7) + 10),
    );
    const first = orderDeck(pool);
    expect(orderDeck(pool)).toEqual(first);
    expect(first.map((m) => m.id).sort((a, b) => a - b)).toEqual(
      pool.map((m) => m.id),
    );
  });

  it("does not change the pool it was given", () => {
    const pool = [movie(1, 1), movie(2, 1), movie(3, 2)];
    const copy = structuredClone(pool);
    orderDeck(pool);
    expect(pool).toEqual(copy);
  });
});

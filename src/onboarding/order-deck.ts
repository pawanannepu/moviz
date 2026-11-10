/** A movie in the deck pool with the genres used only for ordering. */
export type PoolMovie = {
  id: number;
  genreIds: readonly number[];
};

/**
 * Orders the pool by genre rotation (spec 0006, AC-2). The pool arrives in vote
 * order. Each next card is the first remaining movie that shares no genre with
 * the previous two cards, or the first remaining movie when none qualifies.
 * Pure, and the same pool always gives the same order.
 */
export function orderDeck<T extends PoolMovie>(pool: readonly T[]): T[] {
  const remaining = [...pool];
  const ordered: T[] = [];
  while (remaining.length > 0) {
    const recent = ordered.slice(-2);
    const taken = new Set(recent.flatMap((movie) => movie.genreIds));
    const index = remaining.findIndex((movie) =>
      movie.genreIds.every((genreId) => !taken.has(genreId)),
    );
    const [next] = remaining.splice(index === -1 ? 0 : index, 1);
    ordered.push(next);
  }
  return ordered;
}

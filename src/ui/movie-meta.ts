/**
 * The small line under a movie title: the year, then the first two genres, for
 * example "1995, Crime, Drama". Missing parts are dropped, and the result is an
 * empty string when there is nothing to show (spec 0004, AC-8).
 */
export function movieMeta(movie: {
  releaseYear: number | null;
  genres: readonly string[];
}): string {
  const parts: string[] = [];
  if (movie.releaseYear !== null) parts.push(String(movie.releaseYear));
  parts.push(...movie.genres.slice(0, 2));
  return parts.join(", ");
}

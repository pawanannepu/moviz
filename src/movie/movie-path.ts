/*
 * The address of a movie page (spec 0010). Pure and safe to import from client
 * components, such as the feed list.
 */

/** 1 to 15 digits with no leading zero, so the number is always a safe integer. */
const MOVIE_ID_PATTERN = /^[1-9][0-9]{0,14}$/;

/** The page of one catalog movie: `/movie/{id}`. */
export function moviePath(id: number): string {
  return `/movie/${id}`;
}

/**
 * Reads the `id` segment of `/movie/[id]`. Returns our catalog movie id, or
 * null for anything that is not 1 to 15 digits with no leading zero (`0`,
 * `012`, `12a`, `1.5`, `-3`). It makes no read (spec 0010, AC-2).
 */
export function parseMovieId(segment: string): number | null {
  return MOVIE_ID_PATTERN.test(segment) ? Number(segment) : null;
}

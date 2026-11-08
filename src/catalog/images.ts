/** The TMDB poster sizes Moviz uses: small, card, and detail page. */
export type PosterSize = "w185" | "w342" | "w500";

const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/";

/**
 * Width and height in pixels for each poster size (2:3), which `next/image`
 * needs to reserve space before the image loads.
 */
export const POSTER_DIMENSIONS: Record<
  PosterSize,
  { width: number; height: number }
> = {
  w185: { width: 185, height: 278 },
  w342: { width: 342, height: 513 },
  w500: { width: 500, height: 750 },
};

/**
 * The TMDB image address for a stored `poster_path`, or null when the movie has
 * no poster. Posters are always hotlinked from TMDB, never copied (spec 0003).
 */
export function posterUrl(
  posterPath: string | null,
  size: PosterSize,
): string | null {
  if (posterPath === null) return null;
  const path = posterPath.startsWith("/") ? posterPath : `/${posterPath}`;
  return `${IMAGE_BASE_URL}${size}${path}`;
}

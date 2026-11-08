import { createHash } from "node:crypto";

/** The stored data one movie's embedding text is built from. */
export type EmbeddingInput = {
  title: string;
  releaseYear: number | null;
  genres: string[];
  tagline: string | null;
  overview: string | null;
  /** Director names in billing order. */
  directors: string[];
  /** Cast names in billing order. Only the first 5 are used. */
  cast: string[];
};

/** How many cast names go into the text (spec 0003, embedding text recipe). */
export const EMBEDDING_CAST_COUNT = 5;

const present = (value: string | null): value is string =>
  value !== null && value.trim() !== "";

/**
 * Builds the text Voyage embeds (spec 0003, AC-9). Pure: the same data always
 * gives the same text, so the same hash. Lines whose data is missing are left out.
 *
 * ```
 * {title} ({release_year})
 * Genres: {genre names, comma separated, sorted by code point}
 * Tagline: {tagline}
 * {overview, trimmed}
 * Directed by: {director names, billing order}
 * Starring: {top 5 cast names, billing order}
 * ```
 *
 * Lines are joined with "\n", with no trailing newline. With no release year the
 * first line is the title alone.
 */
export function buildEmbeddingText(movie: EmbeddingInput): string {
  const lines = [
    movie.releaseYear === null
      ? movie.title
      : `${movie.title} (${movie.releaseYear})`,
  ];
  if (movie.genres.length > 0) {
    lines.push(`Genres: ${[...movie.genres].sort().join(", ")}`);
  }
  if (present(movie.tagline)) lines.push(`Tagline: ${movie.tagline.trim()}`);
  if (present(movie.overview)) lines.push(movie.overview.trim());
  if (movie.directors.length > 0) {
    lines.push(`Directed by: ${movie.directors.join(", ")}`);
  }
  if (movie.cast.length > 0) {
    lines.push(
      `Starring: ${movie.cast.slice(0, EMBEDDING_CAST_COUNT).join(", ")}`,
    );
  }
  return lines.join("\n");
}

/** SHA 256 of the embedding text, as lowercase hex. Stored as `text_hash`. */
export function hashEmbeddingText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

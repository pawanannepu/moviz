/**
 * Builds the lookup key for a movie title. Catalog loading and Letterboxd
 * import both call this one function, so the same title always gives the same
 * key (spec 0002, AC-9).
 *
 * Unicode NFKD, strip combining marks, lower case, `&` becomes `and`, every run
 * of characters that are not letters or digits becomes one space, trim.
 * Articles are kept: "The Matrix" stays "the matrix".
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

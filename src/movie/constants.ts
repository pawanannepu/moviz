/*
 * The numbers and fixed copy of the movie detail page (spec 0010). Copy lives
 * here so the server, the client and the tests read one source.
 */

/** The most cast members the page lists, in billing order. */
export const CAST_LIMIT = 8;

export const BACK_TO_PICKS = "Back to picks";
export const CAST_TITLE = "Cast";
export const DIRECTED_BY = "Directed by";

/** The status text for screen readers while the movie loads (also the retry status). */
export const LOADING_LABEL = "Loading movie";

export const NOT_FOUND_TITLE = "Movie not found";
export const NOT_FOUND_BODY =
  "This movie is not in Moviz. It may have been removed.";

export const LOAD_ERROR_TITLE = "We couldn't load this movie.";
export const LOAD_ERROR_BODY = "Check your connection and try again.";

/** The page title when there is no movie to name: no session, or a failed read. */
export const PLAIN_PAGE_TITLE = "Moviz";
export const NOT_FOUND_PAGE_TITLE = `${NOT_FOUND_TITLE} · Moviz`;

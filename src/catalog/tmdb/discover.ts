import { err, ok, type Result } from "@/lib/result";
import type { RequestOptions, TmdbClient, TmdbError } from "./client";
import { tmdbDiscoverPageSchema, tmdbGenreListSchema } from "./schemas";

/** TMDB serves at most this many discover pages. Page 501 is an error. */
export const MAX_DISCOVER_PAGE = 500;

export type DiscoverQuery = {
  sortBy: "vote_count.desc" | "popularity.desc";
  /** First page is 1. */
  page: number;
  /** Fewest votes a movie must have. */
  minVotes: number;
  /** `YYYY-MM-DD`. Movies released on or before this day. */
  releasedOnOrBefore?: string;
  /** `YYYY-MM-DD`. Movies released on or after this day. */
  releasedOnOrAfter?: string;
};

export type DiscoverPage = {
  /** TMDB ids in the order TMDB ranked them. */
  ids: number[];
  totalPages: number;
};

/**
 * One page of TMDB discover (spec 0003, Seed algorithm and Cron job). Adult and
 * video entries are always excluded. Only ids come back, because discover cannot
 * filter on poster or overview: eligibility is checked on the details.
 */
export async function discoverMovies(
  client: TmdbClient,
  query: DiscoverQuery,
  options?: RequestOptions,
): Promise<Result<DiscoverPage, TmdbError>> {
  if (query.page < 1 || query.page > MAX_DISCOVER_PAGE) {
    return ok({ ids: [], totalPages: 0 });
  }
  const params: Record<string, string | number | boolean> = {
    sort_by: query.sortBy,
    "vote_count.gte": query.minVotes,
    include_adult: false,
    include_video: false,
    language: "en-US",
    page: query.page,
  };
  if (query.releasedOnOrBefore !== undefined) {
    params["primary_release_date.lte"] = query.releasedOnOrBefore;
  }
  if (query.releasedOnOrAfter !== undefined) {
    params["primary_release_date.gte"] = query.releasedOnOrAfter;
  }

  const result = await client.get(
    "/discover/movie",
    params,
    tmdbDiscoverPageSchema,
    options,
  );
  if (!result.ok) return err(result.error);
  return ok({
    ids: result.value.results.map((movie) => movie.id),
    totalPages: result.value.total_pages,
  });
}

/** TMDB's movie genre names, in English. */
export async function getGenreNames(
  client: TmdbClient,
  options?: RequestOptions,
): Promise<Result<string[], TmdbError>> {
  const result = await client.get(
    "/genre/movie/list",
    { language: "en-US" },
    tmdbGenreListSchema,
    options,
  );
  if (!result.ok) return err(result.error);
  return ok(
    result.value.genres
      .map((genre) => genre.name.trim())
      .filter((name) => name !== ""),
  );
}

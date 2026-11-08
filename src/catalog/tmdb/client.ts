import type { z } from "zod";
import {
  type HttpFailure,
  type HttpRuntime,
  requestJson,
} from "@/catalog/http/request-json";
import { err, ok, type Result } from "@/lib/result";
import { type TmdbMovieDetails, tmdbMovieDetailsSchema } from "./schemas";

/**
 * Thin TMDB client (spec 0003, AC-15, AC-16). Every response is parsed with Zod,
 * and expected failures come back as a typed `TmdbError`, never a throw. Retry,
 * backoff and timeout rules live in `requestJson`, shared with the Voyage client.
 *
 * The token goes only into the `Authorization` header. It is never put in a URL,
 * an error, or a log line, and neither is a response body.
 */

const BASE_URL = "https://api.themoviedb.org/3";

export {
  BACKOFF_BASE_MS,
  BACKOFF_JITTER_MS,
  MAX_ATTEMPTS,
  RETRY_AFTER_CAP_MS,
} from "@/catalog/http/request-json";
export const REQUEST_TIMEOUT_MS = 10_000;

export type TmdbError =
  /** 401 or 403: the token is wrong. A run must stop, not skip movies. */
  | { code: "tmdb_unauthorized" }
  /** 404: TMDB does not have this thing (for a refresh, the movie was removed). */
  | { code: "tmdb_not_found" }
  /** The response was not the shape we parse. */
  | { code: "tmdb_bad_shape" }
  /** Another 4xx: our request was refused and a retry would not help. */
  | { code: "tmdb_rejected"; status: number }
  /** 429, 5xx, timeout or network error on every try. `status` is null for a network error. */
  | { code: "tmdb_unavailable"; status: number | null };

export type TmdbClientOptions = HttpRuntime & {
  /** TMDB API Read Access Token. */
  token: string;
  baseUrl?: string;
};

export type RequestOptions = {
  /**
   * Epoch milliseconds after which no retry starts. A `Retry-After` wait is cut
   * to the time left. Omit for no time limit.
   */
  deadline?: number;
};

type QueryValue = string | number | boolean;

export type TmdbClient = {
  /** Fetches one path, parses the JSON with `schema`, retries per AC-15. */
  get<S extends z.ZodType>(
    path: string,
    query: Record<string, QueryValue>,
    schema: S,
    options?: RequestOptions,
  ): Promise<Result<z.infer<S>, TmdbError>>;
  /** Movie details with credits and alternative titles, in English. */
  getMovieDetails(
    tmdbId: number,
    options?: RequestOptions,
  ): Promise<Result<TmdbMovieDetails, TmdbError>>;
};

function toTmdbError(failure: HttpFailure): TmdbError {
  switch (failure.code) {
    case "unauthorized":
      return { code: "tmdb_unauthorized" };
    case "not_found":
      return { code: "tmdb_not_found" };
    case "bad_shape":
      return { code: "tmdb_bad_shape" };
    case "rejected":
      return { code: "tmdb_rejected", status: failure.status };
    case "unavailable":
      return { code: "tmdb_unavailable", status: failure.status };
  }
}

/** Builds a TMDB client. Pure setup: nothing is fetched until a method is called. */
export function createTmdbClient(options: TmdbClientOptions): TmdbClient {
  const baseUrl = options.baseUrl ?? BASE_URL;

  async function get<S extends z.ZodType>(
    path: string,
    query: Record<string, QueryValue>,
    schema: S,
    requestOptions: RequestOptions = {},
  ): Promise<Result<z.infer<S>, TmdbError>> {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
    const result = await requestJson(
      {
        url,
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: "application/json",
        },
        schema,
        timeoutMs: REQUEST_TIMEOUT_MS,
        deadline: requestOptions.deadline,
      },
      options,
    );
    return result.ok ? ok(result.value) : err(toTmdbError(result.error));
  }

  return {
    get,
    getMovieDetails: (tmdbId, requestOptions) =>
      get(
        `/movie/${tmdbId}`,
        {
          language: "en-US",
          append_to_response: "credits,alternative_titles",
        },
        tmdbMovieDetailsSchema,
        requestOptions,
      ),
  };
}

import { z } from "zod";

/**
 * Zod shapes for the TMDB responses Moviz reads (spec 0003, AC-15). Only the
 * fields we use are named, so extra fields TMDB adds are ignored. A field we do
 * not store is not listed. Text TMDB may leave empty arrives as `""` or null,
 * which `mapDetails` turns into null.
 */

const castMemberSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  character: z.string().nullish(),
  order: z.number().int(),
  profile_path: z.string().nullish(),
});

const crewMemberSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  job: z.string(),
  profile_path: z.string().nullish(),
});

/** `GET /movie/{id}?append_to_response=credits,alternative_titles`. */
export const tmdbMovieDetailsSchema = z.object({
  id: z.number().int(),
  adult: z.boolean().nullish(),
  title: z.string().nullish(),
  original_title: z.string().nullish(),
  overview: z.string().nullish(),
  tagline: z.string().nullish(),
  release_date: z.string().nullish(),
  poster_path: z.string().nullish(),
  runtime: z.number().nullish(),
  original_language: z.string().nullish(),
  popularity: z.number().nullish(),
  vote_average: z.number().nullish(),
  vote_count: z.number().nullish(),
  genres: z
    .array(z.object({ id: z.number().int(), name: z.string() }))
    .nullish(),
  credits: z
    .object({
      cast: z.array(castMemberSchema).nullish(),
      crew: z.array(crewMemberSchema).nullish(),
    })
    .nullish(),
  alternative_titles: z
    .object({
      titles: z.array(z.object({ title: z.string() })).nullish(),
    })
    .nullish(),
});

export type TmdbMovieDetails = z.infer<typeof tmdbMovieDetailsSchema>;

/** `GET /discover/movie`. Only the ids and the page count are read. */
export const tmdbDiscoverPageSchema = z.object({
  page: z.number().int(),
  total_pages: z.number().int(),
  results: z.array(z.object({ id: z.number().int() })),
});

/** `GET /genre/movie/list`. */
export const tmdbGenreListSchema = z.object({
  genres: z.array(z.object({ id: z.number().int(), name: z.string() })),
});

const watchProviderSchema = z.object({
  provider_id: z.number().int(),
  provider_name: z.string(),
  logo_path: z.string().nullish(),
  display_priority: z.number().nullish(),
});

const watchOffersSchema = z.array(watchProviderSchema).nullish();

/**
 * `GET /movie/{id}/watch/providers` (spec 0013). Every country TMDB knows the
 * movie in, keyed by its ISO 3166 code. The data comes from JustWatch.
 */
export const tmdbWatchProvidersSchema = z.object({
  id: z.number().int(),
  results: z.record(
    z.string(),
    z.object({
      link: z.string().nullish(),
      flatrate: watchOffersSchema,
      free: watchOffersSchema,
      ads: watchOffersSchema,
      rent: watchOffersSchema,
      buy: watchOffersSchema,
    }),
  ),
});

export type TmdbWatchProviders = z.infer<typeof tmdbWatchProvidersSchema>;

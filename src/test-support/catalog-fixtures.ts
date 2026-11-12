import { randomInt } from "node:crypto";
import { inArray } from "drizzle-orm";
import { EMBEDDING_DIMENSIONS } from "@/catalog/embedding/model";
import type { VoyageClient } from "@/catalog/embedding/voyage-client";
import type { TmdbMovieDetails } from "@/catalog/tmdb/schemas";
import type { Db } from "@/db/create-db";
import { movieExternalIds, movies, people } from "@/db/schema";

/**
 * Shared support for the catalog tests. Only test files import this.
 *
 * Every id is random and large, so test files can run side by side on one
 * database and never touch each other's rows, and never touch a real TMDB id.
 */

/** A TMDB movie id no real movie has. */
export const newTmdbId = () => 900_000_000 + randomInt(0, 90_000_000);

/** A TMDB person id no real person has. */
export const newPersonId = () => 900_000_000 + randomInt(0, 90_000_000);

/** A day `days` ago as `YYYY-MM-DD` in UTC. */
export function daysAgo(days: number, from: Date = new Date()): string {
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * A complete, eligible TMDB details response. Titles carry `tag` so a title
 * lookup in a shared database finds only this test's movie.
 */
export function details(
  tag: string,
  overrides: Partial<TmdbMovieDetails> = {},
): TmdbMovieDetails {
  const id = overrides.id ?? newTmdbId();
  return {
    id,
    adult: false,
    title: `Movie ${tag}`,
    original_title: `Movie ${tag}`,
    overview: `An overview for ${tag}.`,
    tagline: `A tagline for ${tag}`,
    release_date: "2001-05-05",
    poster_path: `/poster-${id}.jpg`,
    runtime: 100,
    original_language: "en",
    popularity: 10,
    vote_average: 7.5,
    vote_count: 1000,
    genres: [
      { id: 18, name: "Drama" },
      { id: 28, name: "Action" },
    ],
    credits: {
      cast: [
        {
          id: newPersonId(),
          name: `Actor ${tag}`,
          character: "Lead",
          order: 0,
          profile_path: null,
        },
      ],
      crew: [
        {
          id: newPersonId(),
          name: `Director ${tag}`,
          job: "Director",
          profile_path: null,
        },
      ],
    },
    alternative_titles: { titles: [] },
    ...overrides,
  };
}

export type FakeTmdbOptions = {
  /** Details by TMDB id. An id that is not here answers 404. */
  movies: Map<number, TmdbMovieDetails>;
  /** Discover pages when sorted by vote count: page 1 is `pages[0]`. */
  votePages?: number[][];
  /** Discover pages when sorted by popularity (the new hit step). */
  hitPages?: number[][];
  /** A fixed status for one movie id (for example 500 or 401). */
  statusFor?: Map<number, number>;
  /** A raw JSON body for one movie id, for example one of the wrong shape. */
  rawFor?: Map<number, unknown>;
  /** Movie ids TMDB answers 404 for, even when `unknownStatus` is not 404. */
  notFound?: Set<number>;
  /**
   * What TMDB answers for a movie id that is neither in `movies` nor in
   * `notFound`. Defaults to 404. Tests that run the daily job on a shared
   * database set it to 500, so another test's movies are never rewritten or
   * marked removed by this test's fake.
   */
  unknownStatus?: number;
  /** A fixed status for every request (for example 401). */
  allStatus?: number;
};

/**
 * A stand in for TMDB that speaks just enough of its API: the genre list,
 * discover, and movie details. `calls` records every request path, so a test can
 * assert that no detail call was made. It records the path only, never a header.
 */
export function fakeTmdb(options: FakeTmdbOptions) {
  const calls: string[] = [];
  const urls: URL[] = [];
  const tmdbFetch = (async (input: URL | string | Request) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const path = url.pathname.replace(/^\/3/, "");
    calls.push(path);
    urls.push(url);

    if (options.allStatus) {
      return new Response("{}", { status: options.allStatus });
    }
    if (path === "/genre/movie/list") {
      return Response.json({
        genres: [
          { id: 18, name: "Drama" },
          { id: 28, name: "Action" },
          { id: 35, name: "Comedy" },
        ],
      });
    }
    if (path === "/discover/movie") {
      const page = Number(url.searchParams.get("page") ?? "1");
      const pages =
        url.searchParams.get("sort_by") === "popularity.desc"
          ? (options.hitPages ?? [])
          : (options.votePages ?? []);
      return Response.json({
        page,
        total_pages: Math.max(1, pages.length),
        results: (pages[page - 1] ?? []).map((id) => ({ id })),
      });
    }
    const detail = /^\/movie\/(\d+)$/.exec(path);
    if (detail) {
      const id = Number(detail[1]);
      const forced = options.statusFor?.get(id);
      if (forced) return new Response("{}", { status: forced });
      if (options.rawFor?.has(id)) return Response.json(options.rawFor.get(id));
      const found = options.movies.get(id);
      if (found) return Response.json(found);
      const status = options.notFound?.has(id)
        ? 404
        : (options.unknownStatus ?? 404);
      return new Response("{}", { status });
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetch: tmdbFetch, calls, urls };
}

/** A Voyage stand in. Returns one vector per text, and records each batch. */
export function fakeVoyage(
  behavior: {
    /** Fail the nth call (counting from 1). */
    failOnCall?: { call: number; code: "voyage_unavailable" };
    /** Return no vector (a wrong size one, as the real client does) for texts that include this string. */
    wrongSizeFor?: string;
    /** Runs while a batch is "at Voyage", before the answer comes back. */
    onBatch?: (texts: string[]) => Promise<void>;
  } = {},
) {
  const batches: string[][] = [];
  const client: VoyageClient = {
    // The catalog never embeds a query. Bite search tests bring their own fake.
    async embedQuery() {
      return { ok: false, error: { code: "voyage_unavailable", status: null } };
    },
    async embedDocuments(texts) {
      batches.push(texts);
      await behavior.onBatch?.(texts);
      if (behavior.failOnCall?.call === batches.length) {
        return {
          ok: false,
          error: { code: behavior.failOnCall.code, status: 503 },
        };
      }
      return {
        ok: true,
        value: texts.map((text, index) => {
          if (behavior.wrongSizeFor && text.includes(behavior.wrongSizeFor)) {
            return null;
          }
          const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
          vector[index % EMBEDDING_DIMENSIONS] = 1;
          return vector;
        }),
      };
    },
  };
  return { client, batches };
}

/** Removes the movies stored for these TMDB ids, and the people made for them. */
export async function removeCatalogRows(
  db: Db,
  tmdbIds: number[],
  personIds: number[] = [],
): Promise<void> {
  if (tmdbIds.length > 0) {
    const rows = await db
      .select({ movieId: movieExternalIds.movieId })
      .from(movieExternalIds)
      .where(
        inArray(
          movieExternalIds.externalId,
          tmdbIds.map((id) => String(id)),
        ),
      );
    if (rows.length > 0) {
      await db.delete(movies).where(
        inArray(
          movies.id,
          rows.map((row) => row.movieId),
        ),
      );
    }
  }
  if (personIds.length > 0) {
    await db.delete(people).where(inArray(people.tmdbId, personIds));
  }
}

/** Every TMDB person id named in a details response. */
export function personIdsOf(movie: TmdbMovieDetails): number[] {
  return [
    ...(movie.credits?.cast ?? []).map((member) => member.id),
    ...(movie.credits?.crew ?? []).map((member) => member.id),
  ];
}

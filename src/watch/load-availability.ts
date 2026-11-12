import { and, eq, sql } from "drizzle-orm";
import type { TmdbClient } from "@/catalog/tmdb/client";
import type { Db } from "@/db/create-db";
import {
  movieExternalIds,
  movies,
  type StoredWatchRegion,
  watchAvailability,
} from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import {
  DAY_MS,
  HOUR_MS,
  WATCH_FETCH_TIMEOUT_MS,
  WATCH_STALE_MAX_DAYS,
  WATCH_TTL_HOURS,
} from "./constants";
import { storedWatchRegionSchema, toRegions } from "./offers";

export type AvailabilityDeps = {
  db: Db;
  /** Absent when `TMDB_API_TOKEN` is unset: only cached rows can be shown. */
  tmdb?: Pick<TmdbClient, "getWatchProviders">;
};

export type Availability = {
  /** The offers for the asked country, or null when it has none. */
  region: StoredWatchRegion | null;
  fetchedAt: Date;
};

export type AvailabilityError = { code: "unavailable" };

type CachedRow = {
  /** `regions -> country`: the raw JSON for one country, or null. */
  region: unknown;
  fetchedAt: Date | null;
  tmdbExternalId: string | null;
};

/** Parses one stored country. `undefined` means the stored value is broken. */
function parseRegion(raw: unknown): StoredWatchRegion | null | undefined {
  if (raw === null || raw === undefined) return null;
  const parsed = storedWatchRegionSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function toTmdbId(externalId: string | null): number | null {
  if (externalId === null) return null;
  const id = Number(externalId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Writes every country TMDB returned. The later of two parallel writes wins. */
async function writeRow(
  db: Db,
  movieId: number,
  regions: Record<string, StoredWatchRegion>,
  fetchedAt: Date,
): Promise<void> {
  try {
    await db
      .insert(watchAvailability)
      .values({ movieId, regions, fetchedAt })
      .onConflictDoUpdate({
        target: watchAvailability.movieId,
        set: { regions, fetchedAt },
      });
  } catch {
    // The answer is still shown; the next view simply asks TMDB again.
  }
}

/**
 * Where to watch one movie in one country (spec 0013, AC-7 to AC-9). Reads only
 * `regions -> country` and `fetched_at`. A row younger than `WATCH_TTL_HOURS`
 * is used as is. Otherwise TMDB is asked once, with one 4 second try: success
 * writes every country, a 404 writes an empty row, and any other failure falls
 * back to a row younger than `WATCH_STALE_MAX_DAYS`, else `unavailable`. A
 * movie with no TMDB id has no offers, with no call. Never throws.
 */
export async function loadAvailability(
  deps: AvailabilityDeps,
  input: { movieId: number; country: string; now: Date },
): Promise<Result<Availability, AvailabilityError>> {
  const { db, tmdb } = deps;
  const { movieId, country, now } = input;

  let row: CachedRow | undefined;
  try {
    [row] = await db
      .select({
        region: sql<unknown>`${watchAvailability.regions} -> ${country}`,
        fetchedAt: watchAvailability.fetchedAt,
        tmdbExternalId: movieExternalIds.externalId,
      })
      .from(movies)
      .leftJoin(watchAvailability, eq(watchAvailability.movieId, movies.id))
      .leftJoin(
        movieExternalIds,
        and(
          eq(movieExternalIds.movieId, movies.id),
          eq(movieExternalIds.provider, "tmdb"),
        ),
      )
      .where(eq(movies.id, movieId));
  } catch {
    return err({ code: "unavailable" });
  }
  // The movie itself is gone: nothing to show, and nothing to ask TMDB about.
  if (row === undefined) return ok({ region: null, fetchedAt: now });

  const age =
    row.fetchedAt === null ? null : now.getTime() - row.fetchedAt.getTime();
  const cached = row.fetchedAt === null ? undefined : parseRegion(row.region);

  if (
    age !== null &&
    age < WATCH_TTL_HOURS * HOUR_MS &&
    cached !== undefined &&
    row.fetchedAt !== null
  ) {
    return ok({ region: cached, fetchedAt: row.fetchedAt });
  }

  const tmdbId = toTmdbId(row.tmdbExternalId);
  if (tmdbId === null) return ok({ region: null, fetchedAt: now });

  const fetched = tmdb
    ? await tmdb
        .getWatchProviders(tmdbId, {
          timeoutMs: WATCH_FETCH_TIMEOUT_MS,
          maxAttempts: 1,
        })
        .catch(() => null)
    : null;

  if (fetched?.ok) {
    const regions = toRegions(fetched.value);
    await writeRow(db, movieId, regions, now);
    return ok({ region: regions[country] ?? null, fetchedAt: now });
  }
  if (fetched && !fetched.ok && fetched.error.code === "tmdb_not_found") {
    await writeRow(db, movieId, {}, now);
    return ok({ region: null, fetchedAt: now });
  }

  // No token, a timeout, an error or a wrong shape: a week old answer beats none.
  if (
    age !== null &&
    age < WATCH_STALE_MAX_DAYS * DAY_MS &&
    cached !== undefined &&
    row.fetchedAt !== null
  ) {
    return ok({ region: cached, fetchedAt: row.fetchedAt });
  }
  return err({ code: "unavailable" });
}

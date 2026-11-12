import { createTmdbClient } from "@/catalog/tmdb/client";
import { db } from "@/db/client";
import { env } from "@/env";
import { loadAvailability } from "./load-availability";
import { groupOffers } from "./offers";
import { countryOptions } from "./regions";
import {
  type WhereToWatchState,
  WhereToWatchView,
} from "./where-to-watch-view";

/**
 * Where to watch on the movie page (spec 0013). An async Server Component the
 * page wraps in its own Suspense, so the rest of the page never waits for it.
 * It reads the cached offers for the country (asking TMDB at most once a day
 * per movie) and renders the matching state. It never throws: every failure is
 * a state.
 */
export async function WhereToWatch({
  movieId,
  country,
}: {
  movieId: number;
  country: string | null;
}) {
  const options = countryOptions();
  const state = await sectionState(movieId, country);
  return <WhereToWatchView state={state} options={options} />;
}

async function sectionState(
  movieId: number,
  country: string | null,
): Promise<WhereToWatchState> {
  if (country === null) return { kind: "no_country" };
  try {
    const tmdb = env.TMDB_API_TOKEN
      ? createTmdbClient({ token: env.TMDB_API_TOKEN })
      : undefined;
    const result = await loadAvailability(
      { db, tmdb },
      { movieId, country, now: new Date() },
    );
    if (!result.ok) return { kind: "unavailable", country };
    const groups = result.value.region ? groupOffers(result.value.region) : [];
    if (groups.length === 0) return { kind: "empty", country };
    return {
      kind: "offers",
      country,
      groups,
      link: result.value.region?.link ?? null,
    };
  } catch {
    return { kind: "unavailable", country };
  }
}

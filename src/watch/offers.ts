import { z } from "zod";
import type { TmdbWatchProviders } from "@/catalog/tmdb/schemas";
import type {
  StoredWatchOffer,
  StoredWatchRegion,
  WatchOfferType,
} from "@/db/schema";
import { GROUP_LABELS, MAX_PROVIDERS_PER_GROUP } from "./constants";

/**
 * Pure shaping of TMDB watch data (spec 0013, AC-2). `toRegions` turns the
 * TMDB body into the shape we store; `groupOffers` turns one country into the
 * groups the section shows.
 */

const OFFER_TYPES: readonly WatchOfferType[] = [
  "flatrate",
  "free",
  "ads",
  "rent",
  "buy",
];

/** A service with no TMDB priority sorts after every service that has one. */
const NO_PRIORITY = Number.MAX_SAFE_INTEGER;

/** Lower priority first, then by name. */
function byPriorityThenName(a: StoredWatchOffer, b: StoredWatchOffer): number {
  return a.priority - b.priority || a.name.localeCompare(b.name, "en");
}

/**
 * Our stored `regions` from a TMDB watch providers body: every two letter
 * country, upper cased, with only the fields we keep. Inside each offer type a
 * service appears once, sorted by priority then name and capped at
 * `MAX_PROVIDERS_PER_GROUP`, which keeps rows small and still leaves enough
 * for the merged Free group.
 */
export function toRegions(
  body: TmdbWatchProviders,
): Record<string, StoredWatchRegion> {
  const regions: Record<string, StoredWatchRegion> = {};
  for (const [rawCode, region] of Object.entries(body.results)) {
    const code = rawCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) continue;
    const offers: StoredWatchOffer[] = [];
    for (const type of OFFER_TYPES) {
      const seen = new Set<number>();
      const ofType: StoredWatchOffer[] = [];
      for (const provider of region[type] ?? []) {
        if (seen.has(provider.provider_id)) continue;
        seen.add(provider.provider_id);
        ofType.push({
          type,
          providerId: provider.provider_id,
          name: provider.provider_name,
          logoPath: provider.logo_path ?? null,
          priority: provider.display_priority ?? NO_PRIORITY,
        });
      }
      offers.push(
        ...ofType.sort(byPriorityThenName).slice(0, MAX_PROVIDERS_PER_GROUP),
      );
    }
    regions[code] = { link: region.link ?? null, offers };
  }
  return regions;
}

/** The parsed shape of one stored country, checked on every read. */
export const storedWatchRegionSchema = z.object({
  link: z.string().nullable(),
  offers: z.array(
    z.object({
      type: z.enum(["flatrate", "free", "ads", "rent", "buy"]),
      providerId: z.number().int(),
      name: z.string(),
      logoPath: z.string().nullable(),
      priority: z.number(),
    }),
  ),
});

export type OfferGroupKey = keyof typeof GROUP_LABELS;

export type OfferGroup = {
  key: OfferGroupKey;
  label: string;
  offers: StoredWatchOffer[];
};

const GROUP_TYPES: Record<OfferGroupKey, readonly WatchOfferType[]> = {
  stream: ["flatrate"],
  // A service in both `free` and `ads` is kept once, as its `free` entry.
  free: ["free", "ads"],
  rent: ["rent"],
  buy: ["buy"],
};

/**
 * The groups one country shows, in the order Stream, Free, Rent, Buy (AC-2).
 * A group with no offers is left out. Each group is sorted by priority then
 * name and holds at most `MAX_PROVIDERS_PER_GROUP` services.
 */
export function groupOffers(region: StoredWatchRegion): OfferGroup[] {
  const groups: OfferGroup[] = [];
  for (const key of Object.keys(GROUP_TYPES) as OfferGroupKey[]) {
    const seen = new Set<number>();
    const offers: StoredWatchOffer[] = [];
    for (const type of GROUP_TYPES[key]) {
      for (const offer of region.offers) {
        if (offer.type !== type || seen.has(offer.providerId)) continue;
        seen.add(offer.providerId);
        offers.push(offer);
      }
    }
    if (offers.length === 0) continue;
    groups.push({
      key,
      label: GROUP_LABELS[key],
      offers: offers.sort(byPriorityThenName).slice(0, MAX_PROVIDERS_PER_GROUP),
    });
  }
  return groups;
}

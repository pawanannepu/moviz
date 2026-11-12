import { describe, expect, it } from "vitest";
import fixture from "@/catalog/tmdb/__fixtures__/watch-providers-949.json";
import { tmdbWatchProvidersSchema } from "@/catalog/tmdb/schemas";
import type { StoredWatchOffer, StoredWatchRegion } from "@/db/schema";
import { MAX_PROVIDERS_PER_GROUP } from "./constants";
import { groupOffers, storedWatchRegionSchema, toRegions } from "./offers";

// Spec 0013, AC-2: the shape we store from a TMDB body, and the groups one
// country shows (order, the free and ads merge, sorting, the cap).

const body = tmdbWatchProvidersSchema.parse(fixture);

const offer = (
  type: StoredWatchOffer["type"],
  providerId: number,
  name: string,
  priority: number,
): StoredWatchOffer => ({
  type,
  providerId,
  name,
  logoPath: `/logo${providerId}.png`,
  priority,
});

const names = (region: StoredWatchRegion) =>
  groupOffers(region).map(
    (group) => `${group.label}: ${group.offers.map((o) => o.name).join(", ")}`,
  );

describe("toRegions (AC-2, AC-7)", () => {
  it("keeps only two letter countries, upper cased", () => {
    expect(Object.keys(toRegions(body)).sort()).toEqual(["FR", "GB", "US"]);
  });

  it("keeps the TMDB link, and null when TMDB sent none", () => {
    const regions = toRegions(body);
    expect(regions.US.link).toBe(
      "https://www.themoviedb.org/movie/949-heat/watch?locale=US",
    );
    expect(regions.GB.link).toBeNull();
  });

  it("stores only our fields for each offer, with a null logo when missing", () => {
    const regions = toRegions(body);
    expect(regions.FR.offers).toEqual([
      {
        type: "flatrate",
        providerId: 381,
        name: "Canal+",
        logoPath: null,
        priority: 2,
      },
    ]);
  });

  it("sorts a service with no TMDB priority after every service that has one", () => {
    const regions = toRegions({
      id: 1,
      results: {
        US: {
          flatrate: [
            { provider_id: 1, provider_name: "Unranked" },
            {
              provider_id: 2,
              provider_name: "Ranked",
              display_priority: 99,
            },
          ],
        },
      },
    });
    expect(regions.US.offers.map((o) => o.name)).toEqual([
      "Ranked",
      "Unranked",
    ]);
  });

  it("keeps a service once per offer type, sorted, and caps each type", () => {
    const flatrate = Array.from({ length: 12 }, (_, i) => ({
      provider_id: i,
      provider_name: `Service ${i}`,
      display_priority: 12 - i,
    }));
    const regions = toRegions({
      id: 1,
      results: { US: { flatrate: [...flatrate, flatrate[0]] } },
    });
    const kept = regions.US.offers;
    expect(kept).toHaveLength(MAX_PROVIDERS_PER_GROUP);
    expect(kept[0].name).toBe("Service 11");
    expect(new Set(kept.map((o) => o.providerId)).size).toBe(kept.length);
  });

  it("gives a country with no offer lists an empty offer list", () => {
    const regions = toRegions({ id: 1, results: { US: { link: "x" } } });
    expect(regions.US).toEqual({ link: "x", offers: [] });
  });

  it("returns no countries for an empty TMDB answer", () => {
    expect(toRegions({ id: 1, results: {} })).toEqual({});
  });

  it("produces rows the read schema accepts", () => {
    for (const region of Object.values(toRegions(body))) {
      expect(storedWatchRegionSchema.safeParse(region).success).toBe(true);
    }
  });
});

describe("groupOffers (AC-2)", () => {
  it("orders the groups Stream, Free, Rent, Buy and merges free and ads", () => {
    expect(names(toRegions(body).US)).toEqual([
      "Stream: Netflix, Max",
      "Free: Tubi TV, Pluto TV",
      "Rent: Amazon Video, Apple TV",
      "Buy: Apple TV",
    ]);
  });

  it("keeps a service that is in free and ads once, as its free entry", () => {
    const free = groupOffers(toRegions(body).US).find((g) => g.key === "free");
    const tubi = free?.offers.filter((o) => o.providerId === 73);
    expect(tubi).toHaveLength(1);
    expect(tubi?.[0].type).toBe("free");
  });

  it("sorts by priority, then by name when the priority is the same", () => {
    const region: StoredWatchRegion = {
      link: null,
      offers: [
        offer("rent", 1, "Zeta", 2),
        offer("rent", 2, "beta", 1),
        offer("rent", 3, "Alpha", 1),
      ],
    };
    expect(names(region)).toEqual(["Rent: Alpha, beta, Zeta"]);
  });

  it("leaves out a group with no offers", () => {
    const groups = groupOffers(toRegions(body).FR);
    expect(groups.map((g) => g.key)).toEqual(["stream"]);
  });

  it("caps every group at eight, the merged Free group too", () => {
    const region: StoredWatchRegion = {
      link: null,
      offers: [
        ...Array.from({ length: 6 }, (_, i) =>
          offer("free", 100 + i, `Free ${i}`, i),
        ),
        ...Array.from({ length: 6 }, (_, i) =>
          offer("ads", 200 + i, `Ads ${i}`, i),
        ),
      ],
    };
    const [free] = groupOffers(region);
    expect(free.key).toBe("free");
    expect(free.offers).toHaveLength(MAX_PROVIDERS_PER_GROUP);
    expect(free.offers.slice(0, 2).map((o) => o.name)).toEqual([
      "Ads 0",
      "Free 0",
    ]);
  });

  it("returns no groups for a country with no offers", () => {
    expect(groupOffers({ link: "x", offers: [] })).toEqual([]);
  });
});

describe("storedWatchRegionSchema (AC-7)", () => {
  it("rejects a stored row with an unknown offer type", () => {
    const broken = {
      link: null,
      offers: [{ ...offer("rent", 1, "A", 1), type: "lease" }],
    };
    expect(storedWatchRegionSchema.safeParse(broken).success).toBe(false);
  });
});

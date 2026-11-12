"use client";

import type { SetCountryResult } from "@/watch/actions";
import type { OfferGroup } from "@/watch/offers";
import type { CountryOption } from "@/watch/regions";
import {
  WhereToWatchSkeleton,
  type WhereToWatchState,
  WhereToWatchView,
} from "@/watch/where-to-watch-view";

/** Made up services for the review page. Logos are left out, so the frames show. */
const SAMPLE_GROUPS: OfferGroup[] = [
  {
    key: "stream",
    label: "Stream",
    offers: [
      {
        type: "flatrate",
        providerId: 1,
        name: "Northlight",
        logoPath: null,
        priority: 1,
      },
      {
        type: "flatrate",
        providerId: 2,
        name: "Reel House",
        logoPath: null,
        priority: 2,
      },
    ],
  },
  {
    key: "free",
    label: "Free",
    offers: [
      {
        type: "ads",
        providerId: 3,
        name: "Open Matinee",
        logoPath: null,
        priority: 1,
      },
    ],
  },
  {
    key: "rent",
    label: "Rent",
    offers: [
      {
        type: "rent",
        providerId: 4,
        name: "Corner Video",
        logoPath: null,
        priority: 1,
      },
      {
        type: "rent",
        providerId: 5,
        name: "Second Feature Store",
        logoPath: null,
        priority: 2,
      },
    ],
  },
  {
    key: "buy",
    label: "Buy",
    offers: [
      {
        type: "buy",
        providerId: 4,
        name: "Corner Video",
        logoPath: null,
        priority: 1,
      },
    ],
  },
];

const CASES: { label: string; id: string; state: WhereToWatchState }[] = [
  {
    label: "Services in your country",
    id: "wtw-offers",
    state: {
      kind: "offers",
      country: "US",
      groups: SAMPLE_GROUPS,
      link: "https://www.themoviedb.org/",
    },
  },
  {
    label: "Not found on streaming",
    id: "wtw-empty",
    state: { kind: "empty", country: "FR" },
  },
  {
    label: "No country yet (the picker is open)",
    id: "wtw-no-country",
    state: { kind: "no_country" },
  },
  {
    label: "Could not load, and no saved answer",
    id: "wtw-unavailable",
    state: { kind: "unavailable", country: "GB" },
  },
];

/** Nothing is saved from the review page: Save fails with the error line. */
async function fakeSave(): Promise<SetCountryResult> {
  return { ok: false, error: { code: "db_unavailable" } };
}

/**
 * Where to watch in every state on the `/design` page (spec 0013). Headings
 * sit at level 4 here, under the page's own section headings.
 */
export function WhereToWatchDemo({ options }: { options: CountryOption[] }) {
  return (
    <div className="flex flex-col gap-12">
      {CASES.map((item) => (
        <div key={item.id} className="flex flex-col gap-3">
          <p className="type-small">{item.label}</p>
          <WhereToWatchView
            state={item.state}
            options={options}
            headingLevel={4}
            idPrefix={item.id}
            save={fakeSave}
          />
        </div>
      ))}
      <div className="flex flex-col gap-3">
        <p className="type-small">Loading</p>
        <WhereToWatchSkeleton headingLevel={4} />
      </div>
    </div>
  );
}

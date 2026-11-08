import type { CatalogMovie } from "@/catalog/read/get-movie";

/** The movie shown on the landing page, with the reason that goes on its poster. */
export type HeroPick = {
  movie: Pick<CatalogMovie, "id" | "title" | "releaseYear" | "posterPath">;
  reason: string;
};

/** The reason shown when the catalog cannot supply a poster. */
export const SAMPLE_REASON = "Because you rated Heat highly.";

/**
 * The fixed landing page picks, in order. The first one the catalog holds with
 * a poster wins. Titles and years are matched with the same rule as the
 * Letterboxd import (`matchMovies`).
 */
export const HERO_PICKS: readonly {
  title: string;
  year: number;
  reason: string;
}[] = [
  { title: "Collateral", year: 2004, reason: SAMPLE_REASON },
  {
    title: "Blade Runner 2049",
    year: 2017,
    reason: "Because you rated Blade Runner highly.",
  },
];

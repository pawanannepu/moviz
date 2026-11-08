import { normalizeTitle } from "@/catalog/normalize-title";
import type { TmdbMovieDetails } from "@/catalog/tmdb/schemas";

/** How many cast members are stored per movie (spec 0003, Feature design). */
export const MAX_CAST = 10;

export type TitleRow = {
  titleNormalized: string;
  kind: "primary" | "original" | "alternate";
};

export type PersonCredit = {
  tmdbPersonId: number;
  name: string;
  profilePath: string | null;
  role: "cast" | "director";
  billingOrder: number;
  characterName: string | null;
};

/** One TMDB movie, shaped for our tables. Pure data, no ids of ours yet. */
export type MappedMovie = {
  tmdbId: number;
  adult: boolean;
  /** Display title. Empty only when every title came out empty (`empty_title`). */
  title: string;
  titleNormalized: string;
  originalTitle: string | null;
  releaseDate: string | null;
  overview: string | null;
  tagline: string | null;
  runtimeMinutes: number | null;
  posterPath: string | null;
  originalLanguage: string | null;
  popularity: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  /** Genre names, sorted by code point, no duplicates. */
  genres: string[];
  /** One row per distinct title key. Always starts with the `primary` row, unless `title` is empty. */
  titles: TitleRow[];
  /** Top cast then directors, already deduplicated by (person, role). */
  credits: PersonCredit[];
};

/** TMDB sends `""` for "nothing". We store null for any blank text. */
function blankToNull(value: string | null | undefined): string | null {
  return value == null || value.trim() === "" ? null : value;
}

/** Compares by UTF-16 code unit, which is what a plain `sort()` does. */
function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Builds the title rows (AC-3). Order of precedence is primary, original, then
 * each alternate, and the first row for a key wins. A title whose key is empty
 * is dropped. If the primary key is empty the original title takes its place as
 * the movie's title and `primary` row, with no separate `original` row.
 */
function mapTitles(
  primary: string | null,
  original: string | null,
  alternates: string[],
): { title: string; titleNormalized: string; titles: TitleRow[] } {
  const primaryKey = primary === null ? "" : normalizeTitle(primary);
  const originalKey = original === null ? "" : normalizeTitle(original);

  let title = "";
  let titleNormalized = "";
  const candidates: TitleRow[] = [];
  if (primary !== null && primaryKey !== "") {
    title = primary;
    titleNormalized = primaryKey;
    candidates.push({ titleNormalized: primaryKey, kind: "primary" });
    if (originalKey !== "") {
      candidates.push({ titleNormalized: originalKey, kind: "original" });
    }
  } else if (original !== null && originalKey !== "") {
    title = original;
    titleNormalized = originalKey;
    candidates.push({ titleNormalized: originalKey, kind: "primary" });
  }
  if (title === "") return { title, titleNormalized, titles: [] };

  for (const alternate of alternates) {
    const key = normalizeTitle(alternate);
    if (key !== "")
      candidates.push({ titleNormalized: key, kind: "alternate" });
  }

  const seen = new Set<string>();
  const titles: TitleRow[] = [];
  for (const row of candidates) {
    if (seen.has(row.titleNormalized)) continue;
    seen.add(row.titleNormalized);
    titles.push(row);
  }
  return { title, titleNormalized, titles };
}

/**
 * Merges credits that name the same person in the same role (AC-18). The lowest
 * order is kept and distinct character names are joined with " / ", in order.
 */
function dedupeCredits(credits: PersonCredit[]): PersonCredit[] {
  const ordered = [...credits].sort((a, b) => a.billingOrder - b.billingOrder);
  const merged = new Map<string, PersonCredit>();
  for (const credit of ordered) {
    const key = `${credit.tmdbPersonId}:${credit.role}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, credit);
      continue;
    }
    const names = [existing.characterName, credit.characterName].filter(
      (name): name is string => name !== null,
    );
    merged.set(key, {
      ...existing,
      characterName:
        names.length === 0 ? null : [...new Set(names)].join(" / "),
    });
  }
  return [...merged.values()];
}

/**
 * Turns a parsed TMDB details response into our shape. Pure. Empty text becomes
 * null, titles and credits follow the rules in spec 0003. Does not decide
 * eligibility; that is `isEligible`.
 */
export function mapDetails(details: TmdbMovieDetails): MappedMovie {
  const { title, titleNormalized, titles } = mapTitles(
    blankToNull(details.title),
    blankToNull(details.original_title),
    (details.alternative_titles?.titles ?? []).map((entry) => entry.title),
  );

  const cast: PersonCredit[] = [...(details.credits?.cast ?? [])]
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_CAST)
    .flatMap((member) => {
      const name = blankToNull(member.name);
      if (name === null) return [];
      return [
        {
          tmdbPersonId: member.id,
          name,
          profilePath: blankToNull(member.profile_path),
          role: "cast" as const,
          billingOrder: member.order,
          characterName: blankToNull(member.character),
        },
      ];
    });

  // Crew entries have no `order`, so billing follows their place in TMDB's list.
  const directors: PersonCredit[] = (details.credits?.crew ?? []).flatMap(
    (member, index) => {
      const name = blankToNull(member.name);
      if (member.job !== "Director" || name === null) return [];
      return [
        {
          tmdbPersonId: member.id,
          name,
          profilePath: blankToNull(member.profile_path),
          role: "director" as const,
          billingOrder: index,
          characterName: null,
        },
      ];
    },
  );

  return {
    tmdbId: details.id,
    adult: details.adult ?? false,
    title,
    titleNormalized,
    originalTitle: blankToNull(details.original_title),
    releaseDate: blankToNull(details.release_date),
    overview: blankToNull(details.overview),
    tagline: blankToNull(details.tagline),
    runtimeMinutes: details.runtime ?? null,
    posterPath: blankToNull(details.poster_path),
    originalLanguage: blankToNull(details.original_language),
    popularity: details.popularity ?? null,
    voteAverage: details.vote_average ?? null,
    voteCount: details.vote_count ?? null,
    genres: sortedUnique(
      (details.genres ?? []).flatMap((genre) => {
        const name = blankToNull(genre.name);
        return name === null ? [] : [name];
      }),
    ),
    titles,
    credits: dedupeCredits([...cast, ...directors]),
  };
}

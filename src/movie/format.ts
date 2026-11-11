import type { CastMember, CatalogMovie } from "@/catalog/read/get-movie";
import { CAST_LIMIT, DIRECTED_BY } from "./constants";

const NAME_LIST = new Intl.ListFormat("en-US", { type: "conjunction" });

/**
 * Words a runtime: "2h 50m", "2h" when the minutes are 0, "45m" under one
 * hour. Returns null for a null or non positive runtime (spec 0010, AC-5).
 */
export function formatRuntime(runtimeMinutes: number | null): string | null {
  if (runtimeMinutes === null || !(runtimeMinutes > 0)) return null;
  const total = Math.floor(runtimeMinutes);
  if (total === 0) return null;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/**
 * The meta line of the detail page: the year, the runtime, then every genre,
 * for example "1995, 2h 50m, Crime, Drama". Missing parts are dropped, and the
 * result is an empty string when there is nothing to show (spec 0010, AC-5).
 */
export function detailMeta(
  movie: Pick<CatalogMovie, "releaseYear" | "runtimeMinutes" | "genres">,
): string {
  const parts: string[] = [];
  if (movie.releaseYear !== null) parts.push(String(movie.releaseYear));
  const runtime = formatRuntime(movie.runtimeMinutes);
  if (runtime) parts.push(runtime);
  parts.push(...movie.genres);
  return parts.join(", ");
}

/**
 * The director names in billing order, joined as a sentence list: "A",
 * "A and B", "A, B, and C". Returns null when there is no director
 * (spec 0010, AC-6).
 */
export function directorNames(
  directors: readonly { name: string }[],
): string | null {
  if (directors.length === 0) return null;
  return NAME_LIST.format(directors.map((director) => director.name));
}

/** The whole director line as plain text: "Directed by A and B", or null. */
export function directorLine(
  directors: readonly { name: string }[],
): string | null {
  const names = directorNames(directors);
  return names === null ? null : `${DIRECTED_BY} ${names}`;
}

/** One cast row: the name, and the character when it has one. */
export type CastLine = {
  personId: number;
  name: string;
  character: string | null;
};

/**
 * The first `CAST_LIMIT` cast members in billing order. A null or blank
 * character name becomes null, so the row shows the name alone (spec 0010,
 * AC-6).
 */
export function castLines(
  cast: readonly Pick<CastMember, "personId" | "name" | "characterName">[],
): CastLine[] {
  return cast.slice(0, CAST_LIMIT).map((member) => {
    const character = member.characterName?.trim() ?? "";
    return {
      personId: member.personId,
      name: member.name,
      character: character === "" ? null : character,
    };
  });
}

/**
 * The browser title of a movie page: "Heat (1995) · Moviz". The year and its
 * parentheses are left out when the year is null (spec 0010, AC-19).
 */
export function moviePageTitle(
  movie: Pick<CatalogMovie, "title" | "releaseYear">,
): string {
  const year = movie.releaseYear === null ? "" : ` (${movie.releaseYear})`;
  return `${movie.title}${year} · Moviz`;
}

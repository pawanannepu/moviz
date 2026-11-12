/**
 * The countries TMDB has watch data for (spec 0013, AC-5, AC-6). Checked in so
 * no page view has to ask TMDB for the list. Refresh it with
 * `pnpm watch:regions`, which prints the current list from
 * `/watch/providers/regions`.
 */
export const WATCH_REGIONS = [
  "AD",
  "AE",
  "AG",
  "AL",
  "AO",
  "AR",
  "AT",
  "AU",
  "AZ",
  "BA",
  "BB",
  "BE",
  "BF",
  "BG",
  "BH",
  "BM",
  "BO",
  "BR",
  "BS",
  "BY",
  "BZ",
  "CA",
  "CD",
  "CH",
  "CI",
  "CL",
  "CM",
  "CO",
  "CR",
  "CU",
  "CV",
  "CY",
  "CZ",
  "DE",
  "DK",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "ES",
  "FI",
  "FJ",
  "FR",
  "GB",
  "GF",
  "GG",
  "GH",
  "GI",
  "GQ",
  "GR",
  "GT",
  "GY",
  "HK",
  "HN",
  "HR",
  "HU",
  "ID",
  "IE",
  "IL",
  "IN",
  "IQ",
  "IS",
  "IT",
  "JM",
  "JO",
  "JP",
  "KE",
  "KR",
  "KW",
  "LB",
  "LC",
  "LI",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MG",
  "MK",
  "ML",
  "MT",
  "MU",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NE",
  "NG",
  "NI",
  "NL",
  "NO",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PS",
  "PT",
  "PY",
  "QA",
  "RO",
  "RS",
  "RU",
  "SA",
  "SC",
  "SE",
  "SG",
  "SI",
  "SK",
  "SM",
  "SN",
  "SV",
  "TC",
  "TD",
  "TH",
  "TN",
  "TR",
  "TT",
  "TW",
  "TZ",
  "UA",
  "UG",
  "US",
  "UY",
  "VA",
  "VE",
  "XK",
  "YE",
  "ZA",
  "ZM",
  "ZW",
] as const;

export type WatchRegion = (typeof WATCH_REGIONS)[number];

const REGION_SET: ReadonlySet<string> = new Set(WATCH_REGIONS);

/** True when `code` (already upper case) is one of `WATCH_REGIONS`. */
export function isWatchRegion(code: string): code is WatchRegion {
  return REGION_SET.has(code);
}

/**
 * Reads a country code from outside (the IP header, a stored profile value):
 * trimmed and upper cased, and kept only when it is in `WATCH_REGIONS`. Codes
 * like `XX` or `T1` give null.
 */
export function toWatchRegion(
  value: string | null | undefined,
): WatchRegion | null {
  if (value === null || value === undefined) return null;
  const code = value.trim().toUpperCase();
  return isWatchRegion(code) ? code : null;
}

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

/** The English name of a country code, or the code itself when there is none. */
export function countryName(code: string): string {
  try {
    return displayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export type CountryOption = { code: WatchRegion; name: string };

/** Every watch region with its English name, sorted by name (AC-6). */
export function countryOptions(): CountryOption[] {
  return WATCH_REGIONS.map((code) => ({ code, name: countryName(code) })).sort(
    (a, b) => a.name.localeCompare(b.name, "en"),
  );
}

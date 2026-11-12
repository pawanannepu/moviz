import {
  FIRST_DECADE,
  LAST_DECADE,
  LONG_MIN_MINUTES,
  OLD_BEFORE_YEAR,
  RECENT_YEARS,
  SHORT_MAX_MINUTES,
} from "./rules";
import type { PhraseFilters } from "./types";

/*
 * The word rules (spec 0012, AC-4 and AC-5). Pure: the same phrase and year
 * always give the same filters. Matching is case insensitive on whole words, so
 * "shortcake" is not "short". The words also match inside titles people type
 * ("The Old Guard"); the "Looking for" line shows the user what happened.
 */

type Hit =
  | { kind: "runtime_max"; minutes: number }
  | { kind: "runtime_min"; minutes: number }
  | { kind: "years"; from?: number; to?: number; label: string };

type Rule = { pattern: RegExp; toHit: (match: RegExpExecArray) => Hit | null };

/** Not after a letter or digit, and not before one: a whole word. */
const START = String.raw`(?<![\p{L}\p{N}])`;
const END = String.raw`(?![\p{L}\p{N}])`;
const word = (body: string) => new RegExp(`${START}(?:${body})${END}`, "giu");

const NUMBER = String.raw`(\d+(?:\.\d+)?)`;

const DECADE_WORDS: Record<string, number> = {
  thirties: 1930,
  forties: 1940,
  fifties: 1950,
  sixties: 1960,
  seventies: 1970,
  eighties: 1980,
  nineties: 1990,
};

const decadeHit = (decade: number): Hit => ({
  kind: "years",
  from: decade,
  to: decade + 9,
  label: `from the ${decade}s`,
});

function rules(currentYear: number): Rule[] {
  return [
    {
      pattern: word("short|quick"),
      toHit: () => ({ kind: "runtime_max", minutes: SHORT_MAX_MINUTES }),
    },
    {
      pattern: word(String.raw`under\s+${NUMBER}\s*(?:minutes|mins)`),
      toHit: (m) => ({
        kind: "runtime_max",
        minutes: Math.floor(Number(m[1])),
      }),
    },
    {
      pattern: word(String.raw`under\s+${NUMBER}\s*(?:hours|hour)`),
      toHit: (m) => ({
        kind: "runtime_max",
        minutes: Math.floor(Number(m[1]) * 60),
      }),
    },
    {
      pattern: word("long|epic"),
      toHit: () => ({ kind: "runtime_min", minutes: LONG_MIN_MINUTES }),
    },
    {
      // "1980s", from the 1920s to the 2020s.
      pattern: word(String.raw`(\d{3}0)s`),
      toHit: (m) => {
        const decade = Number(m[1]);
        return decade >= FIRST_DECADE && decade <= LAST_DECADE
          ? decadeHit(decade)
          : null;
      },
    },
    {
      // "80s" or "'80s": 30s to 90s are 19xx, 00s to 20s are 20xx.
      pattern: word(String.raw`['’]?(\d0)s`),
      toHit: (m) => {
        const tens = Number(m[1]);
        if (tens >= 30) return decadeHit(1900 + tens);
        if (tens <= 20) return decadeHit(2000 + tens);
        return null;
      },
    },
    {
      pattern: word(Object.keys(DECADE_WORDS).join("|")),
      toHit: (m) => decadeHit(DECADE_WORDS[m[0].toLowerCase()]),
    },
    {
      pattern: word("old|classic"),
      toHit: () => ({
        kind: "years",
        to: OLD_BEFORE_YEAR - 1,
        label: `before ${OLD_BEFORE_YEAR}`,
      }),
    },
    {
      pattern: word("new|recent"),
      toHit: () => ({
        kind: "years",
        from: currentYear - RECENT_YEARS,
        to: currentYear,
        label: `from ${currentYear - RECENT_YEARS} on`,
      }),
    },
  ];
}

type Found = { hit: Hit; start: number; end: number };

/** Every rule match in the phrase, with where it sits. */
function findHits(phrase: string, currentYear: number): Found[] {
  const found: Found[] = [];
  for (const rule of rules(currentYear)) {
    for (const match of phrase.matchAll(rule.pattern)) {
      const hit = rule.toHit(match);
      if (hit === null || match.index === undefined) continue;
      found.push({
        hit,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  return found;
}

/**
 * Turns the hard limits in a search phrase into filters (spec 0012, AC-4):
 * "short", "under 90 minutes", "under 2 hours", "long", decades ("1980s",
 * "'80s", "eighties"), "old" and "recent". Two maximum runtimes keep the
 * smaller; a maximum and a minimum together drop both; more than one different
 * year rule drops every year rule. `labels` words each filter for the
 * "Looking for" line, runtime first, then years (AC-5). `currentYear` is the
 * server's UTC year.
 */
export function parsePhrase(
  phrase: string,
  options: { currentYear: number },
): PhraseFilters {
  const hits = findHits(phrase, options.currentYear).map((f) => f.hit);
  const filters: PhraseFilters = { labels: [] };

  const maxes = hits.flatMap((h) =>
    h.kind === "runtime_max" ? [h.minutes] : [],
  );
  const mins = hits.flatMap((h) =>
    h.kind === "runtime_min" ? [h.minutes] : [],
  );
  if (maxes.length > 0 && mins.length === 0) {
    filters.runtimeMax = Math.min(...maxes);
    filters.labels.push(`under ${filters.runtimeMax} minutes`);
  } else if (mins.length > 0 && maxes.length === 0) {
    filters.runtimeMin = Math.max(...mins);
    filters.labels.push(`at least ${filters.runtimeMin} minutes`);
  }

  // The same rule twice ("old classic") is one rule.
  const years = new Map<string, Extract<Hit, { kind: "years" }>>();
  for (const hit of hits) {
    if (hit.kind === "years") years.set(`${hit.from}-${hit.to}`, hit);
  }
  if (years.size === 1) {
    const [only] = years.values();
    if (only.from !== undefined) filters.yearFrom = only.from;
    if (only.to !== undefined) filters.yearTo = only.to;
    filters.labels.push(only.label);
  }
  return filters;
}

/**
 * The phrase with every word rule match taken out and the spaces collapsed,
 * for the words mode query (spec 0012, AC-9). Can be empty.
 */
export function phraseWithoutRuleWords(
  phrase: string,
  options: { currentYear: number },
): string {
  const spans = findHits(phrase, options.currentYear).sort(
    (a, b) => b.start - a.start,
  );
  let rest = phrase;
  let cut = Number.POSITIVE_INFINITY;
  for (const span of spans) {
    // Back to front, skipping any span that overlaps one already cut.
    if (span.end > cut) continue;
    rest = `${rest.slice(0, span.start)} ${rest.slice(span.end)}`;
    cut = span.start;
  }
  return rest.replace(/\s+/g, " ").trim();
}

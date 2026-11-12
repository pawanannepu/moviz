import { quoted, REASON_PHRASE_MAX } from "./constants";
import type { BiteReason } from "./types";

/** The phrase cut to `REASON_PHRASE_MAX` characters, with "…" when cut. */
function shortPhrase(phrase: string): string {
  const characters = [...phrase];
  return characters.length > REASON_PHRASE_MAX
    ? `${characters.slice(0, REASON_PHRASE_MAX).join("")}…`
    : phrase;
}

/**
 * The reason line of a search card (spec 0012, AC-8): "Fits “…”, close to
 * Heat (1995)" or "Fits “…”" in vibe mode, "Matches your words “…”" in words
 * mode. No year and no parentheses when the year is null, no full stop. Pure.
 */
export function biteReasonSentence(reason: BiteReason): string {
  const phrase = quoted(shortPhrase(reason.phrase));
  if (reason.kind === "bite_words") return `Matches your words ${phrase}`;
  if (!reason.anchor) return `Fits ${phrase}`;
  const { title, releaseYear } = reason.anchor;
  const named = releaseYear === null ? title : `${title} (${releaseYear})`;
  return `Fits ${phrase}, close to ${named}`;
}

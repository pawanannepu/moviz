import { PHRASE_MAX_LENGTH, PHRASE_MIN_LENGTH } from "./constants";

/** Why a phrase was refused (spec 0012, AC-2). */
export type PhraseProblem = "too_short" | "too_long";

/** Trims the phrase and collapses every run of whitespace inside it to one space. */
export function normalizePhrase(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Checks a phrase after `normalizePhrase` (spec 0012, AC-2): 2 to 120
 * characters. Pure, so the form and the Server Action share it.
 */
export function checkPhrase(
  raw: string,
): { ok: true; phrase: string } | { ok: false; problem: PhraseProblem } {
  const phrase = normalizePhrase(raw);
  // Count characters, not UTF-16 units, so an emoji is one.
  const length = [...phrase].length;
  if (length < PHRASE_MIN_LENGTH) return { ok: false, problem: "too_short" };
  if (length > PHRASE_MAX_LENGTH) return { ok: false, problem: "too_long" };
  return { ok: true, phrase };
}

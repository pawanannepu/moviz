import type { DbUnavailable, UserNotFound } from "@/db/failure";
import type { MovieCardMovie } from "@/ui/movie-card";

/**
 * What the word rules understood (spec 0012, AC-4). Runtime bounds are in
 * minutes, year bounds are inclusive. `labels` are the plain words of the
 * "Looking for" line, runtime first, then years (AC-5).
 */
export type PhraseFilters = {
  runtimeMax?: number;
  runtimeMin?: number;
  yearFrom?: number;
  yearTo?: number;
  labels: string[];
};

/** `vibe`: the phrase was embedded. `words`: plain full text search (AC-9). */
export type BiteMode = "vibe" | "words";

/** The liked movie a vibe pick is close to. */
export type BiteAnchor = {
  movieId: number;
  title: string;
  releaseYear: number | null;
};

/**
 * Why a movie fits a search. It does not join the recommender's `Reason`
 * union, so the feed's types do not change.
 */
export type BiteReason =
  | { kind: "bite_vibe"; phrase: string; anchor: BiteAnchor | null }
  | { kind: "bite_words"; phrase: string };

/** One search result, shaped for a feed card. Plain data, safe to send to the client. */
export type BitePick = { movie: MovieCardMovie; reason: BiteReason };

export type BiteSearchResult = {
  mode: BiteMode;
  filters: PhraseFilters;
  picks: BitePick[];
};

export type QuotaExceeded = {
  code: "quota_exceeded";
  /** The next UTC midnight, ISO 8601. */
  resetsAt: string;
};

export type BiteSearchError = QuotaExceeded | UserNotFound | DbUnavailable;

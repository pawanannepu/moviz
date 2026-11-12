"use client";

import { createContext, type ReactNode, useContext, useRef } from "react";
import type { BiteSearchResult } from "./types";

/** The last search that showed results or the empty state, as it was left. */
export type KeptSearch = {
  /** The user the search was made for. */
  userId: string;
  /** The normalized phrase. */
  phrase: string;
  result: BiteSearchResult;
  /** The movie whose card was opened last, so focus can return to it. */
  openedId: number | null;
};

export type SearchStore = {
  /** The kept search when it belongs to this user, else null. Pure. */
  read: (userId: string) => KeptSearch | null;
  /** Replaces the kept search. */
  save: (kept: KeptSearch) => void;
  /** Remembers the card the user just opened. */
  markOpened: (movieId: number) => void;
};

function createSearchStore(): SearchStore {
  let kept: KeptSearch | null = null;
  return {
    read: (userId) => (kept && kept.userId === userId ? kept : null),
    save: (next) => {
      kept = next;
    },
    markOpened: (movieId) => {
      if (kept) kept = { ...kept, openedId: movieId };
    },
  };
}

/** Used where no provider is mounted (the `/design` page): it keeps nothing. */
const EMPTY_STORE: SearchStore = {
  read: () => null,
  save: () => undefined,
  markOpened: () => undefined,
};

const SearchStoreContext = createContext<SearchStore>(EMPTY_STORE);

/**
 * Keeps the last bite search in browser memory for the visit, so Back from a
 * movie page shows it again without a new search or a spent quota unit (spec
 * 0012, AC-13). Mounted in the `(protected)` layout beside the feed store and
 * keyed by user id. Nothing goes to `localStorage`, a cookie or the URL, so a
 * reload or a sign out (a full page load) empties it. It never touches the
 * feed store.
 */
export function SearchStoreProvider({ children }: { children: ReactNode }) {
  const ref = useRef<SearchStore | null>(null);
  if (ref.current === null) ref.current = createSearchStore();
  return (
    <SearchStoreContext.Provider value={ref.current}>
      {children}
    </SearchStoreContext.Provider>
  );
}

/** The search store of the signed in pages. Client components only. */
export function useSearchStore(): SearchStore {
  return useContext(SearchStoreContext);
}

"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react";
import { HOME_PATH } from "@/auth/paths";
import { moviePath } from "@/movie/movie-path";
import type { FeedPick } from "./types";

/** The feed list as it was when the user left it. */
export type KeptFeed = {
  /** The user the list was made for. */
  userId: string;
  /** The movie ids of the first batch the list began with, in order. */
  seedIds: number[];
  /** Every pick on the page, the loaded batches included. */
  picks: FeedPick[];
  /** True when the list had ended. The only Load more state that is kept. */
  done: boolean;
};

export type FeedStore = {
  /**
   * The kept list, when it belongs to this user and began with this first
   * batch (same ids, same order). Otherwise null. Pure: it changes nothing, so
   * it is safe to call while rendering.
   */
  read: (userId: string, seedIds: readonly number[]) => KeptFeed | null;
  /** Replaces the kept list. */
  save: (kept: KeptFeed) => void;
  /** Remembers the movie whose card the user just opened from the feed. */
  markOpened: (movieId: number) => void;
  clearOpened: () => void;
  /** The movie last opened from the feed in this visit, or null. */
  readonly opened: number | null;
};

function sameIds(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Builds a store over plain variables. It lives only as long as its owner. */
function createFeedStore(): FeedStore {
  let kept: KeptFeed | null = null;
  let opened: number | null = null;
  return {
    read(userId, seedIds) {
      if (!kept || kept.userId !== userId) return null;
      return sameIds(kept.seedIds, seedIds) ? kept : null;
    },
    save(next) {
      kept = next;
    },
    markOpened(movieId) {
      opened = movieId;
    },
    clearOpened() {
      opened = null;
    },
    get opened() {
      return opened;
    },
  };
}

/** Used where no provider is mounted (the `/design` page): it keeps nothing. */
const EMPTY_STORE: FeedStore = {
  read: () => null,
  save: () => undefined,
  markOpened: () => undefined,
  clearOpened: () => undefined,
  opened: null,
};

const FeedStoreContext = createContext<FeedStore>(EMPTY_STORE);

/**
 * Keeps the feed's loaded picks in browser memory, so opening a movie and
 * coming back shows the same list (spec 0010, AC-13 and AC-14). Mounted in the
 * `(protected)` layout, above the pages, so it outlives a page change.
 *
 * Nothing is written to `localStorage`, `sessionStorage`, a cookie or the URL.
 * A reload and a sign out (a full page load) empty it. The values sit in a ref,
 * not in state: nothing on screen depends on them between renders, and a write
 * must never re-render the pages below.
 *
 * It also forgets which movie was opened as soon as the path is anything other
 * than `/home` or that movie's page, so "Back to picks" only steps back in
 * history when the feed really is one step behind.
 */
export function FeedStoreProvider({ children }: { children: ReactNode }) {
  const ref = useRef<FeedStore | null>(null);
  if (ref.current === null) ref.current = createFeedStore();
  const store = ref.current;
  const pathname = usePathname();

  useEffect(() => {
    const opened = store.opened;
    if (opened === null) return;
    if (pathname !== HOME_PATH && pathname !== moviePath(opened)) {
      store.clearOpened();
    }
  }, [pathname, store]);

  return (
    <FeedStoreContext.Provider value={store}>
      {children}
    </FeedStoreContext.Provider>
  );
}

/** The feed store of the signed in pages. Client components only. */
export function useFeedStore(): FeedStore {
  return useContext(FeedStoreContext);
}

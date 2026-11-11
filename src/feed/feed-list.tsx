"use client";

import { useEffect, useRef, useState } from "react";
import { HOME_PATH, SIGN_IN_PATH } from "@/auth/paths";
import type { FeedbackKind } from "@/feedback/feedback";
import { FeedbackControls } from "@/feedback/feedback-controls";
import { moviePath } from "@/movie/movie-path";
import { FeedItem } from "@/ui/feed-item";
import { LoadMoreBar, type LoadMoreState } from "@/ui/load-more-bar";
import { loadMoreAction } from "./actions";
import { morePicksLoaded } from "./constants";
import { useFeedStore } from "./feed-store";
import type { FeedPick } from "./types";

type FeedListProps = {
  /** The signed in user, from the session. Keys the kept list in the feed store. */
  userId: string;
  /** The first batch, rendered on the server. */
  initialPicks: FeedPick[];
  /** True when the first batch was already the last. */
  initialDone: boolean;
};

const SIGN_IN_AGAIN = `${SIGN_IN_PATH}?returnTo=${encodeURIComponent(HOME_PATH)}`;

/**
 * The picks, the list around them and the Load more area (spec 0008). It
 * seeds its state from the first batch, sends the ids of every pick on the
 * page with each press, drops any incoming pick that is already shown, and
 * announces how many were added. A refresh starts again at the top of the
 * ranking.
 *
 * The list keeps its place while the user visits a movie page (spec 0010,
 * AC-13). It saves its picks to the feed store, in browser memory only, after
 * every change. When it mounts again for the same user with the same first
 * batch, it starts from the kept picks instead, and puts focus back on the
 * card the user opened. Of the Load more states only `done` is kept: a list
 * left while loading or failed comes back ready to press again.
 *
 * Each card carries the feedback controls (spec 0011). "Not interested" swaps
 * the card for the Hidden line with Undo in the same grid cell, and Undo puts
 * the card back; focus follows to the new control. "More like this" only
 * changes the button. Hidden picks stay in `picks`, so their ids still go out
 * with Load more, and a restore leaves them out with no Hidden line (AC-15).
 *
 * Next.js runs Server Actions from one client one at a time, so `pending` is
 * the only guard against a double press.
 */
export function FeedList({ userId, initialPicks, initialDone }: FeedListProps) {
  const store = useFeedStore();
  // The first batch this list began with. `read` is pure, so calling it in
  // these initializers is safe when React renders twice (Strict Mode).
  const [seedIds] = useState(() => initialPicks.map((pick) => pick.movie.id));
  const [restored] = useState(() => store.read(userId, seedIds) !== null);
  const [picks, setPicks] = useState(
    () => store.read(userId, seedIds)?.picks ?? initialPicks,
  );
  const [state, setState] = useState<LoadMoreState>(() =>
    (store.read(userId, seedIds)?.done ?? initialDone) ? "done" : "idle",
  );
  // Hidden before this list mounted (a restore): left out, no Hidden line.
  const [dropped] = useState(
    () => new Set(store.read(userId, seedIds)?.hiddenIds ?? []),
  );
  // Hidden while this list is on screen: the cell shows the Hidden line.
  const [hiddenNow, setHiddenNow] = useState<ReadonlySet<number>>(new Set());
  // The cell that just swapped between card and Hidden line takes focus.
  const [focusId, setFocusId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the store current. On a first visit, or after the ratings changed the
  // first batch, this replaces whatever list was kept before.
  useEffect(() => {
    store.save({
      userId,
      seedIds,
      picks,
      done: state === "done",
      hiddenIds: [...dropped, ...hiddenNow],
    });
  }, [store, userId, seedIds, picks, state, dropped, hiddenNow]);

  function feedbackSaved(movieId: number, kind: FeedbackKind | null) {
    setPicks((current) =>
      current.map((pick) =>
        pick.movie.id === movieId
          ? { ...pick, moreLikeThis: kind === "more_like_this" }
          : pick,
      ),
    );
    const wasHidden = hiddenNow.has(movieId);
    if (kind === "not_interested" || wasHidden) {
      setHiddenNow((current) => {
        const next = new Set(current);
        if (kind === "not_interested") next.add(movieId);
        else next.delete(movieId);
        return next;
      });
      setFocusId(movieId);
    }
  }

  // After a restore, put focus on the card the user opened, which also brings
  // it into view. Then forget it, so the next visit does not move focus.
  useEffect(() => {
    const opened = store.opened;
    if (opened === null) return;
    store.clearOpened();
    if (!restored) return;
    listRef.current
      ?.querySelector<HTMLAnchorElement>(`[data-movie-id="${opened}"] a`)
      ?.focus();
  }, [store, restored]);

  async function loadMore() {
    if (state === "pending") return;
    // Clearing here, and setting when the call ends, makes the same message
    // twice in a row change the live region, so it is read both times.
    setAnnouncement("");
    setState("pending");

    const result = await loadMoreAction({
      shown: picks.map((pick) => pick.movie.id),
    }).catch(() => null);

    if (!result) return setState("error");
    if (!result.ok) {
      return setState(
        result.error.code === "unauthenticated" ? "session_ended" : "error",
      );
    }

    const onPage = new Set(picks.map((pick) => pick.movie.id));
    const added = result.value.picks.filter((pick) => {
      if (onPage.has(pick.movie.id)) return false;
      onPage.add(pick.movie.id);
      return true;
    });
    setPicks((current) => [...current, ...added]);
    if (added.length > 0) setAnnouncement(morePicksLoaded(added.length));
    setState(result.value.done ? "done" : "idle");
  }

  return (
    <>
      <ul ref={listRef} className="feed-grid">
        {picks
          .filter((pick) => !dropped.has(pick.movie.id))
          .map((pick) => {
            const id = pick.movie.id;
            const controls = (
              <FeedbackControls
                movie={pick.movie}
                kind={
                  hiddenNow.has(id)
                    ? "not_interested"
                    : pick.moreLikeThis
                      ? "more_like_this"
                      : null
                }
                onSaved={(kind) => feedbackSaved(id, kind)}
                onAnnounce={setAnnouncement}
                focusOnMount={focusId === id}
              />
            );
            return (
              <li key={id} data-movie-id={id}>
                {hiddenNow.has(id) ? (
                  controls
                ) : (
                  <FeedItem
                    movie={pick.movie}
                    reason={pick.reason}
                    href={moviePath(id)}
                    onNavigate={() => store.markOpened(id)}
                    controls={controls}
                  />
                )}
              </li>
            );
          })}
      </ul>
      <LoadMoreBar
        state={state}
        onLoadMore={() => void loadMore()}
        signInHref={SIGN_IN_AGAIN}
      />
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

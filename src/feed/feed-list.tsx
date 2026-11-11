"use client";

import { useState } from "react";
import { HOME_PATH, SIGN_IN_PATH } from "@/auth/paths";
import { FeedItem } from "@/ui/feed-item";
import { LoadMoreBar, type LoadMoreState } from "@/ui/load-more-bar";
import { loadMoreAction } from "./actions";
import { morePicksLoaded } from "./constants";
import type { FeedPick } from "./types";

type FeedListProps = {
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
 * announces how many were added. Nothing here is stored: a refresh starts
 * again at the top of the ranking.
 *
 * Next.js runs Server Actions from one client one at a time, so `pending` is
 * the only guard against a double press.
 */
export function FeedList({ initialPicks, initialDone }: FeedListProps) {
  const [picks, setPicks] = useState(initialPicks);
  const [state, setState] = useState<LoadMoreState>(
    initialDone ? "done" : "idle",
  );
  const [announcement, setAnnouncement] = useState("");

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
      <ul className="feed-grid">
        {picks.map((pick) => (
          <li key={pick.movie.id}>
            <FeedItem movie={pick.movie} reason={pick.reason} />
          </li>
        ))}
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

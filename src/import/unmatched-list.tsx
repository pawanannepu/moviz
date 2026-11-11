"use client";

import { useState } from "react";
import { SIGN_IN_PATH } from "@/auth/paths";
import { LoadMoreBar, type LoadMoreState } from "@/ui/load-more-bar";
import { loadMoreUnmatchedAction } from "./actions";
import { IMPORT_PATH } from "./constants";
import type { UnmatchedPage, UnmatchedPageRow } from "./list-unmatched";
import {
  REASON_LABELS,
  UNMATCHED_DONE_LINE,
  UNMATCHED_LOAD_LABELS,
  UNMATCHED_LOAD_MESSAGES,
} from "./messages";

type LoadMore = typeof loadMoreUnmatchedAction;

type UnmatchedListProps = {
  importId: number;
  /** How many rows this import left out, for the heading. */
  total: number;
  /** The first page, read on the server. */
  initial: UnmatchedPage;
  /** The Server Action. Only the `/design` page passes another one. */
  loadMore?: LoadMore;
};

const SIGN_IN_AGAIN = `${SIGN_IN_PATH}?returnTo=${encodeURIComponent(IMPORT_PATH)}`;

/** Which words the bar shows when a load fails (spec 0009, Messages). */
type LoadFailure = "error" | "not_found" | "invalid";

/** Maps the action's error code to the wording the spec gives it. */
function failureOf(
  code: Exclude<Awaited<ReturnType<LoadMore>>, { ok: true }>["error"]["code"],
): LoadFailure {
  switch (code) {
    case "not_found":
      return "not_found";
    case "invalid_cursor":
    case "invalid_input":
      return "invalid";
    case "unauthenticated":
    case "db_unavailable":
      return "error";
  }
}

/** The bar's words for one failure kind. */
const copyFor = (failure: LoadFailure) =>
  ({
    labels: UNMATCHED_LOAD_LABELS,
    messages: {
      error: UNMATCHED_LOAD_MESSAGES[failure],
      session_ended: UNMATCHED_LOAD_MESSAGES.session_ended,
    },
    doneLine: UNMATCHED_DONE_LINE,
  }) as const;

/**
 * The rows an import left out, 50 at a time (spec 0009, AC-11). It seeds its
 * state from the first page, asks for the next one with the cursor the last page
 * returned, drops any row it already shows, and announces how many were added.
 * Server Actions from one client run one at a time, so `pending` is the only
 * guard against a double press.
 */
export function UnmatchedList({
  importId,
  total,
  initial,
  loadMore = loadMoreUnmatchedAction,
}: UnmatchedListProps) {
  const [rows, setRows] = useState<UnmatchedPageRow[]>(initial.rows);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [state, setState] = useState<LoadMoreState>("idle");
  const [failure, setFailure] = useState<LoadFailure>("error");
  const [loadedMore, setLoadedMore] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  async function loadNext() {
    if (state === "pending") return;
    // Clearing first makes the same message twice in a row change the live region.
    setAnnouncement("");
    setState("pending");

    const result = await loadMore({ importId, after: cursor }).catch(
      () => null,
    );
    if (!result) {
      setFailure("error");
      return setState("error");
    }
    if (!result.ok) {
      setFailure(failureOf(result.error.code));
      return setState(
        result.error.code === "unauthenticated" ? "session_ended" : "error",
      );
    }

    const shown = new Set(rows.map((row) => row.rowNumber));
    const added = result.value.rows.filter((row) => {
      if (shown.has(row.rowNumber)) return false;
      shown.add(row.rowNumber);
      return true;
    });
    setRows((current) => [...current, ...added]);
    setCursor(result.value.nextCursor);
    setLoadedMore(true);
    setAnnouncement(
      added.length === 1
        ? "Loaded 1 more row"
        : `Loaded ${added.length} more rows`,
    );
    setState(result.value.nextCursor ? "idle" : "done");
  }

  // The bar shows while there is more to load, and once at the end after a load.
  const showBar = cursor !== null || loadedMore;

  return (
    <section
      aria-labelledby="unmatched-title"
      data-slot="unmatched-list"
      className="flex flex-col gap-4"
    >
      <h3 id="unmatched-title" className="type-title">
        Rows we left out ({total.toLocaleString("en-US")})
      </h3>
      <ul className="flex max-w-3xl flex-col divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.rowNumber}
            className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
          >
            <span className="min-w-0 break-words font-medium">
              {row.title === "" ? "No title" : row.title}
              {row.year ? (
                <span className="type-small ml-2">{row.year}</span>
              ) : null}
            </span>
            <span className="type-small shrink-0">
              {REASON_LABELS[row.reason]}
            </span>
          </li>
        ))}
      </ul>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {showBar ? (
        <LoadMoreBar
          state={state}
          onLoadMore={loadNext}
          signInHref={SIGN_IN_AGAIN}
          copy={copyFor(failure)}
        />
      ) : null}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/ui/primitives/button";

/** Where the Load more area is: ready, working, failed, signed out, or finished. */
export type LoadMoreState =
  | "idle"
  | "pending"
  | "error"
  | "session_ended"
  | "done";

/** The words the bar shows. The defaults are the feed's; another list passes its own. */
export type LoadMoreCopy = {
  labels: { idle: string; pending: string; error: string };
  messages: { error: string; session_ended: string };
  doneLine: string;
};

type LoadMoreBarProps = {
  state: LoadMoreState;
  /** Called by the one button in `idle` and `error`. Ignored while `pending`. */
  onLoadMore: () => void;
  /** The sign in address for `session_ended`. */
  signInHref: string;
  /** Words for a list that is not the feed. Left out, the feed's words are used. */
  copy?: LoadMoreCopy;
};

const DEFAULT_COPY: LoadMoreCopy = {
  labels: {
    idle: "Load more picks",
    pending: "Loading more picks",
    error: "Try again",
  },
  messages: {
    error: "We couldn't load more picks. Check your connection and try again.",
    session_ended: "Your session ended. Sign in to see more picks.",
  },
  doneLine: "That's all for now.",
};

/**
 * The bar under a feed grid (spec 0008, AC-8 to AC-10). One button covers
 * `idle`, `pending` and `error`, so focus never leaves it while it works:
 * `pending` uses `aria-disabled` and `aria-busy`, not `disabled`. A failure
 * is announced in a polite live region and moves focus to the retry button or
 * the sign in link. `done` replaces the button with a line that takes focus
 * only on the change from `pending`, so a keyboard user is not dropped to the
 * top of the page. The parent sets the announcement of how many picks were
 * added before it sets `done`.
 */
export function LoadMoreBar({
  state,
  onLoadMore,
  signInHref,
  copy = DEFAULT_COPY,
}: LoadMoreBarProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const previous = useRef<LoadMoreState>(state);

  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before !== "pending") return;
    if (state === "error") buttonRef.current?.focus();
    if (state === "session_ended") linkRef.current?.focus();
    if (state === "done") doneRef.current?.focus();
  }, [state]);

  const message =
    state === "error" || state === "session_ended" ? copy.messages[state] : "";

  return (
    <div
      data-slot="load-more-bar"
      data-state={state}
      className="flex flex-col items-center gap-3 py-8 text-center"
    >
      <p role="status" className="min-h-0 text-destructive">
        {message}
      </p>
      {state === "done" ? (
        <p ref={doneRef} tabIndex={-1} className="text-muted-foreground">
          {copy.doneLine}
        </p>
      ) : state === "session_ended" ? (
        <Button asChild>
          <Link ref={linkRef} href={signInHref}>
            Sign in
          </Link>
        </Button>
      ) : (
        <Button
          ref={buttonRef}
          type="button"
          variant="secondary"
          aria-disabled={state === "pending" || undefined}
          aria-busy={state === "pending" || undefined}
          onClick={() => {
            if (state !== "pending") onLoadMore();
          }}
          className="aria-disabled:cursor-default aria-disabled:opacity-50"
        >
          {copy.labels[state]}
        </Button>
      )}
    </div>
  );
}

"use client";

import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SIGN_IN_PATH } from "@/auth/paths";
import { cn } from "@/ui/cn";
import { Button } from "@/ui/primitives/button";
import { setFeedbackAction } from "./actions";
import {
  announcements,
  buttonNames,
  HIDDEN_LINE,
  MORE_LIKE_THIS_LABEL,
  NOT_INTERESTED_LABEL,
  SAVE_ERROR,
  SESSION_ENDED,
  SIGN_IN_AGAIN_LABEL,
  UNDO_LABEL,
} from "./constants";
import type { FeedbackKind } from "./feedback";

type Status = "idle" | "pending" | "error" | "session_ended";

export type FeedbackControlsProps = {
  movie: { id: number; title: string };
  /** The saved feedback. The parent owns it and updates it in `onSaved`. */
  kind: FeedbackKind | null;
  /** Runs after the server saved a change, with the new kind. */
  onSaved: (kind: FeedbackKind | null) => void;
  /** Puts a sentence in the caller's polite live region. */
  onAnnounce: (text: string) => void;
  /**
   * Focus the main control when this mounts: Undo when hidden, else "Not
   * interested". The feed sets it on the cell that just swapped between the
   * card and the Hidden line, because that swap mounts a new copy.
   */
  focusOnMount?: boolean;
  className?: string;
};

/**
 * "More like this" and "Not interested" for one movie (spec 0011). When the
 * movie is hidden it shows "Hidden from your picks." and Undo instead. Every
 * press waits for the server: while it runs both buttons are `aria-disabled`
 * and a second press does nothing. A failure changes nothing and shows an
 * inline line, with focus left on the pressed button. A signed out result
 * shows a sign in link and moves focus to it (AC-12).
 *
 * It sits above the card's stretched link (`relative z-10`), so a press never
 * opens the movie page.
 */
export function FeedbackControls({
  movie,
  kind,
  onSaved,
  onAnnounce,
  focusOnMount = false,
  className,
}: FeedbackControlsProps) {
  const [status, setStatus] = useState<Status>("idle");
  const pathname = usePathname();
  const notInterestedRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const signInRef = useRef<HTMLAnchorElement>(null);
  const previousKind = useRef(kind);
  const hidden = kind === "not_interested";

  // On the movie page the controls stay mounted, so a change between hidden
  // and shown moves focus here (AC-11). The feed remounts instead.
  useEffect(() => {
    const before = previousKind.current;
    previousKind.current = kind;
    if (before === kind) return;
    if (kind === "not_interested") undoRef.current?.focus();
    else if (before === "not_interested") notInterestedRef.current?.focus();
  }, [kind]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
  useEffect(() => {
    if (!focusOnMount) return;
    (hidden ? undoRef : notInterestedRef).current?.focus();
  }, []);

  useEffect(() => {
    if (status === "session_ended") signInRef.current?.focus();
  }, [status]);

  async function save(next: FeedbackKind | null) {
    if (status === "pending") return;
    setStatus("pending");
    const result = await setFeedbackAction({
      movieId: movie.id,
      kind: next,
    }).catch(() => null);
    if (!result?.ok) {
      const signedOut = result?.error.code === "unauthenticated";
      setStatus(signedOut ? "session_ended" : "error");
      return;
    }
    setStatus("idle");
    onAnnounce(announcementFor(movie.title, kind, next));
    onSaved(next);
  }

  const pending = status === "pending";
  const signInHref = `${SIGN_IN_PATH}?returnTo=${encodeURIComponent(pathname)}`;
  const busy = {
    "aria-disabled": pending || undefined,
    "aria-busy": pending || undefined,
  };

  return (
    <div
      data-slot="feedback-controls"
      data-state={hidden ? "hidden" : "shown"}
      className={cn("relative z-10 flex flex-col gap-2", className)}
    >
      {hidden ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="type-body">{HIDDEN_LINE}</p>
          <Button
            ref={undoRef}
            type="button"
            variant="secondary"
            aria-label={buttonNames.undo(movie.title)}
            {...busy}
            onClick={() => void save(null)}
          >
            {UNDO_LABEL}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            aria-pressed={kind === "more_like_this"}
            aria-label={buttonNames.moreLikeThis(movie.title)}
            {...busy}
            className="px-3 aria-pressed:border-foreground aria-pressed:bg-surface-hover"
            onClick={() =>
              void save(kind === "more_like_this" ? null : "more_like_this")
            }
          >
            {kind === "more_like_this" ? (
              <Check aria-hidden="true" />
            ) : (
              <Plus aria-hidden="true" />
            )}
            {MORE_LIKE_THIS_LABEL}
          </Button>
          <Button
            ref={notInterestedRef}
            type="button"
            variant="ghost"
            aria-label={buttonNames.notInterested(movie.title)}
            {...busy}
            className="px-3"
            onClick={() => void save("not_interested")}
          >
            {NOT_INTERESTED_LABEL}
          </Button>
        </div>
      )}
      {status === "error" ? (
        <p role="alert" className="type-small text-destructive">
          {SAVE_ERROR}
        </p>
      ) : null}
      {status === "session_ended" ? (
        <p role="alert" className="type-small">
          {SESSION_ENDED}{" "}
          <Link
            ref={signInRef}
            href={signInHref}
            className="inline-flex min-h-11 items-center underline"
          >
            {SIGN_IN_AGAIN_LABEL}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function announcementFor(
  title: string,
  before: FeedbackKind | null,
  after: FeedbackKind | null,
): string {
  if (after === "not_interested") return announcements.hidden(title);
  if (after === "more_like_this") return announcements.moreLikeThis(title);
  return before === "not_interested"
    ? announcements.restored(title)
    : announcements.removedMoreLikeThis(title);
}

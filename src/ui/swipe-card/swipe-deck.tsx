"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { SwipeChoice } from "@/ratings/swipe-score";
import { EXIT_MS } from "./constants";
import {
  type DecisionSource,
  type FocusTarget,
  SwipeCard,
  type SwipeCardMovie,
} from "./swipe-card";

type SwipeDeckProps = {
  /** The movie to show now, or null when there is none. The deck keys the card on its id. */
  movie: SwipeCardMovie | null;
  /** Called once per decision. Save it, then pass the next movie. */
  onDecide: (choice: SwipeChoice) => void;
  /** True while the decision is being saved. */
  pending?: boolean;
  /** Shown when there is no movie. */
  empty?: ReactNode;
  /**
   * Hands every announcement to the screen instead of the deck's own live
   * region, for a screen that says the result and a count in one message. When
   * set, the deck renders no live region.
   */
  onAnnounce?: (message: string) => void;
  /** What should hold focus when the first card appears (for example after an undo). */
  initialFocus?: FocusTarget;
};

/**
 * The swipe card plus what it needs around it (spec 0004, AC-12): the card is
 * keyed on the movie id so each movie gets a fresh card, and a polite live
 * region that stays mounted announces every choice. After a decision the next
 * card waits for the exit to finish, then takes focus (the same button when a
 * button made the decision).
 */
export function SwipeDeck({
  movie,
  onDecide,
  pending = false,
  empty = null,
  onAnnounce,
  initialFocus,
}: SwipeDeckProps) {
  const [message, setMessage] = useState("");
  const [shown, setShown] = useState(movie);
  const [entering, setEntering] = useState(false);
  const focusNext = useRef<FocusTarget | undefined>(undefined);
  const leaving = useRef(false);
  // Applies to the first card only; every later card follows the last decision.
  const mountFocus = useRef(initialFocus);

  const movieId = movie?.id ?? null;
  const shownId = shown?.id ?? null;

  // Show the next movie. After a decision, wait for the card to finish leaving.
  useEffect(() => {
    if (movieId === shownId) return;
    const wait =
      leaving.current &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? EXIT_MS
        : 0;
    const timer = window.setTimeout(() => {
      leaving.current = false;
      mountFocus.current = undefined;
      setEntering(shownId !== null);
      setShown(movie);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [movie, movieId, shownId]);

  // A save that failed (pending ends with the same movie) means nothing is leaving.
  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending && movieId === shownId) {
      leaving.current = false;
    }
    wasPending.current = pending;
  }, [pending, movieId, shownId]);

  function handleDecide(choice: SwipeChoice, source: DecisionSource) {
    leaving.current = true;
    focusNext.current = source === "button" ? choice : "card";
    onDecide(choice);
  }

  // Keep fields fresh when the parent passes the same movie again.
  const current = shown && movie && shown.id === movie.id ? movie : shown;

  return (
    <div data-slot="swipe-deck">
      {onAnnounce ? null : (
        <p aria-live="polite" role="status" className="sr-only">
          {message}
        </p>
      )}
      {current ? (
        <SwipeCard
          key={current.id}
          movie={current}
          onDecide={handleDecide}
          pending={pending}
          announce={onAnnounce ?? setMessage}
          initialFocus={entering ? focusNext.current : mountFocus.current}
          entering={entering}
        />
      ) : (
        empty
      )}
    </div>
  );
}

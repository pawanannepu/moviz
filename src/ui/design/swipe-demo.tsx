"use client";

import { useEffect, useRef, useState } from "react";
import type { SwipeChoice } from "@/ratings/swipe-score";
import { Button } from "@/ui/primitives/button";
import type { SwipeCardMovie } from "@/ui/swipe-card/swipe-card";
import { SwipeDeck } from "@/ui/swipe-card/swipe-deck";

/** How long the pretend save takes. */
const SAVE_MS = 450;

/**
 * The swipe card on the `/design` page. It saves nothing: a short timer stands
 * in for a save. Turn on "Fail the next save" to see the card return.
 */
export function SwipeDemo({ movies }: { movies: SwipeCardMovie[] }) {
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [last, setLast] = useState("Nothing yet");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const movie = movies[index] ?? null;

  function handleDecide(choice: SwipeChoice) {
    if (!movie) return;
    setPending(true);
    setLast(`${choice} for ${movie.title}`);
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      setPending(false);
      if (fail) setLast(`Couldn't save ${choice} for ${movie.title}`);
      else setIndex((current) => current + 1);
    }, SAVE_MS);
  }

  return (
    <div className="flex flex-col gap-6">
      <SwipeDeck
        movie={movie}
        onDecide={handleDecide}
        pending={pending}
        empty={
          <div className="swipe-column flex flex-col items-start gap-4">
            <p>That was the whole demo deck.</p>
            <Button variant="secondary" onClick={() => setIndex(0)}>
              Start again
            </Button>
          </div>
        }
      />
      <div className="flex flex-col items-center gap-3">
        <p className="type-small" aria-live="off">
          Last decision: {last}
        </p>
        <Button
          variant="ghost"
          aria-pressed={failNext}
          onClick={() => setFailNext((current) => !current)}
        >
          {failNext ? "The next save will fail" : "Fail the next save"}
        </Button>
      </div>
    </div>
  );
}

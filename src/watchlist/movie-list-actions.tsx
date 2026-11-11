"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/ui/primitives/button";
import {
  addToWatchlistAction,
  rateMovieAction,
  removeFromWatchlistAction,
} from "./actions";

type MovieListActionsProps = {
  movieId: number;
  watchlisted: boolean;
  score: number | null;
  compact?: boolean;
  showRating?: boolean;
  disabled?: boolean;
};

function actionMessage(code: string): string {
  switch (code) {
    case "already_rated":
      return "This movie is already in your seen list.";
    case "movie_not_found":
      return "This movie is no longer available.";
    case "unauthenticated":
      return "Your session ended. Sign in again to save this change.";
    default:
      return "We couldn't save that change. Please try again.";
  }
}

/** Watchlist and half star rating controls shared by movie pages and lists. */
export function MovieListActions({
  movieId,
  watchlisted: initialWatchlisted,
  score: initialScore,
  compact = false,
  showRating = true,
  disabled = false,
}: MovieListActionsProps) {
  const [watchlisted, setWatchlisted] = useState(initialWatchlisted);
  const [score, setScore] = useState(initialScore);
  const [selectedScore, setSelectedScore] = useState(
    initialScore === null ? "" : String(initialScore),
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setWatchlisted(initialWatchlisted);
    setScore(initialScore);
    setSelectedScore(initialScore === null ? "" : String(initialScore));
  }, [initialScore, initialWatchlisted]);

  function toggleWatchlist() {
    const removing = watchlisted;
    setMessage("");
    setError("");
    startTransition(async () => {
      const action = watchlisted
        ? removeFromWatchlistAction
        : addToWatchlistAction;
      const result = await action({ movieId });
      if (!result.ok) {
        setError(actionMessage(result.error.code));
        return;
      }
      setWatchlisted(!watchlisted);
      setMessage(
        watchlisted
          ? "Removed from your watchlist."
          : "Saved to your watchlist.",
      );
      if (compact && removing) {
        window.requestAnimationFrame(() =>
          document.getElementById("watchlist-heading")?.focus(),
        );
      }
    });
  }

  function saveRating() {
    const value = Number(selectedScore);
    if (!Number.isInteger(value) || value < 1 || value > 10) return;
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await rateMovieAction({ movieId, score: value });
      if (!result.ok) {
        setError(actionMessage(result.error.code));
        return;
      }
      setScore(value);
      setWatchlisted(false);
      setMessage(
        `Saved ${value / 2} ${value === 2 ? "star" : "stars"}. Added to your seen list.`,
      );
      if (compact && score === null) {
        window.requestAnimationFrame(() =>
          document.getElementById("seen-heading")?.focus(),
        );
      }
    });
  }

  return (
    <section
      aria-label="Your movie list actions"
      aria-busy={pending}
      className={`flex flex-col items-start gap-3 ${compact ? "" : "border-card border-t pt-5"}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        {score === null ? (
          <Button
            type="button"
            variant={watchlisted ? "secondary" : "primary"}
            aria-pressed={watchlisted}
            aria-disabled={pending || disabled || undefined}
            onClick={() => !pending && !disabled && toggleWatchlist()}
          >
            {watchlisted ? "Remove from watchlist" : "Add to watchlist"}
          </Button>
        ) : null}
        {showRating ? (
          <label className="flex min-h-11 items-center gap-2 text-muted-foreground">
            <span>
              {score === null
                ? "Mark seen with a rating"
                : `Your rating: ${score / 2} stars`}
            </span>
            <select
              aria-label="Movie rating in half star steps"
              className="min-h-11 rounded-control border border-input bg-card px-3 text-foreground"
              value={selectedScore}
              onChange={(event) => setSelectedScore(event.currentTarget.value)}
              disabled={pending || disabled}
            >
              <option value="">Choose</option>
              {Array.from({ length: 10 }, (_, index) => index + 1).map(
                (value) => (
                  <option key={value} value={value}>
                    {value / 2} {value === 2 ? "star" : "stars"}
                  </option>
                ),
              )}
            </select>
          </label>
        ) : null}
        {showRating ? (
          <Button
            type="button"
            variant="secondary"
            aria-disabled={
              pending || disabled || selectedScore === "" || undefined
            }
            onClick={() => !pending && !disabled && saveRating()}
            className="aria-disabled:cursor-default aria-disabled:opacity-50"
          >
            {score === null ? "Save rating" : "Update rating"}
          </Button>
        ) : null}
      </div>
      <p
        role={error ? "alert" : "status"}
        aria-live={error ? "assertive" : "polite"}
        className={`min-h-6 ${error ? "text-destructive" : "text-small"}`}
      >
        {pending ? "Saving your movie…" : error || message}
      </p>
    </section>
  );
}

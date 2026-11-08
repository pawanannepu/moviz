import { MovieCardSkeleton } from "@/ui/movie-card-skeleton";

/**
 * Shown while a list loads: static poster shaped placeholders (nothing pulses)
 * and a status message for screen readers (spec 0004, AC-14).
 */
export function LoadingState({ label }: { label: string }) {
  return (
    <div data-slot="loading-state">
      <p role="status" className="sr-only">
        {label}
      </p>
      <div className="feed-grid" aria-hidden="true">
        {[0, 1, 2].map((slot) => (
          <MovieCardSkeleton key={slot} />
        ))}
      </div>
    </div>
  );
}

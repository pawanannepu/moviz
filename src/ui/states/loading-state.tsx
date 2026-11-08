import { Skeleton } from "@/ui/primitives/skeleton";

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
          <div key={slot} className="flex flex-col gap-3">
            <Skeleton className="aspect-[2/3] w-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

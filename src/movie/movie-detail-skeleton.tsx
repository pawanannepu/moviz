import { Skeleton } from "@/ui/primitives/skeleton";
import { LOADING_LABEL } from "./constants";

/**
 * A static placeholder in the shape of the detail page: a poster frame, then
 * a title, a meta line and a few lines of text. Nothing pulses. Every block is
 * hidden from screen readers.
 */
export function MovieDetailSkeleton() {
  return (
    <div data-slot="movie-detail-skeleton" className="detail-grid">
      <Skeleton className="aspect-2/3 w-full" />
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
        </div>
        <div className="flex max-w-[62ch] flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  );
}

/**
 * What the movie page shows while the movie loads (spec 0010, AC-10): the
 * skeleton, and the status text "Loading movie" for screen readers. The text
 * is also the page's heading, so this state has its one `h1` too (AC-18).
 */
export function MovieDetailLoading() {
  return (
    <div data-slot="movie-detail-loading">
      <div role="status" className="sr-only">
        <h1>{LOADING_LABEL}</h1>
      </div>
      <MovieDetailSkeleton />
    </div>
  );
}

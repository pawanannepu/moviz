import { Skeleton } from "@/ui/primitives/skeleton";

/** A static placeholder shaped like a `MovieCard`: poster, title and meta line. */
export function MovieCardSkeleton() {
  return (
    <div data-slot="movie-card-skeleton" className="flex flex-col gap-3">
      <Skeleton className="aspect-2/3 w-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

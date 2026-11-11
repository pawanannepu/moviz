import { EmptyState } from "@/ui/states/empty-state";
import { MovieListCard } from "@/watchlist/movie-list-card";

const SAMPLE_WATCHLIST = {
  movieId: 1,
  title: "Heat",
  year: 1995,
  posterPath: null,
  addedAt: new Date("2026-01-01T00:00:00Z"),
};

const SAMPLE_SEEN = {
  movieId: 2,
  title: "Arrival",
  year: 2016,
  posterPath: null,
  score: 9,
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

/** Static previews of the watchlist and seen controls on `/design`. */
export function WatchlistDemo() {
  return (
    <div className="flex flex-col gap-8">
      <div className="feed-grid">
        <MovieListCard movie={SAMPLE_WATCHLIST} kind="watchlist" preview />
        <MovieListCard movie={SAMPLE_SEEN} kind="seen" preview />
      </div>
      <EmptyState
        title="Your watchlist is waiting"
        body="Open any movie to save it here. When you rate it, it moves to your seen list."
        action={{ href: "/home", label: "Browse your picks" }}
        titleAs="h3"
      />
    </div>
  );
}

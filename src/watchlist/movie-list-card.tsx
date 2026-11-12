import Link from "next/link";
import { POSTER_DIMENSIONS, posterUrl } from "@/catalog/images";
import { moviePath } from "@/movie/movie-path";
import { PosterImage } from "@/ui/poster-image";
import { MovieListActions } from "./movie-list-actions";
import type { SeenMovie, WatchlistMovie } from "./watchlist";

type MovieListCardProps =
  | { movie: WatchlistMovie; kind: "watchlist"; preview?: boolean }
  | { movie: SeenMovie; kind: "seen"; preview?: boolean };

/** A saved or seen movie, with direct controls to update its list state. */
export function MovieListCard({
  movie,
  kind,
  preview = false,
}: MovieListCardProps) {
  const { width, height } = POSTER_DIMENSIONS.w342;
  const score = kind === "seen" ? movie.score : null;
  return (
    <article className="flex flex-col gap-4 rounded-sheet bg-card p-4">
      {/* The title link stretches over the poster row (like `MovieCard`), so
          the link's name is just the title and the heading is not nested in
          phrasing content. The link keeps the global focus ring. */}
      <div className="group relative flex items-center gap-4 rounded-control">
        <PosterImage
          src={posterUrl(movie.posterPath, "w342")}
          alt={`Poster for ${movie.title}`}
          width={width}
          height={height}
          title={movie.title}
          className="w-24 shrink-0"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="type-title wrap-break-word text-foreground underline-offset-4 group-hover:underline">
            <Link
              href={moviePath(movie.movieId)}
              className="after:absolute after:inset-0"
            >
              {movie.title}
            </Link>
          </h3>
          {movie.year ? (
            <p className="text-muted-foreground">{movie.year}</p>
          ) : null}
          {kind === "seen" ? (
            <p className="text-muted-foreground">
              Your rating: {movie.score / 2} stars
            </p>
          ) : null}
        </div>
      </div>
      <MovieListActions
        title={movie.title}
        movieId={movie.movieId}
        watchlisted={kind === "watchlist"}
        score={score}
        compact
        disabled={preview}
      />
    </article>
  );
}

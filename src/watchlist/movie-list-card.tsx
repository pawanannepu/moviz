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
      <Link
        href={moviePath(movie.movieId)}
        className="group flex items-center gap-4 rounded-control"
      >
        <PosterImage
          src={posterUrl(movie.posterPath, "w342")}
          alt={`Poster for ${movie.title}`}
          width={width}
          height={height}
          title={movie.title}
          className="w-24 shrink-0"
        />
        <span className="flex min-w-0 flex-col gap-1">
          <h3 className="type-title wrap-break-word text-foreground underline-offset-4 group-hover:underline">
            {movie.title}
          </h3>
          {movie.year ? (
            <span className="text-muted-foreground">{movie.year}</span>
          ) : null}
          {kind === "seen" ? (
            <span className="text-muted-foreground">
              Your rating: {movie.score / 2} stars
            </span>
          ) : null}
        </span>
      </Link>
      <MovieListActions
        movieId={movie.movieId}
        watchlisted={kind === "watchlist"}
        score={score}
        compact
        disabled={preview}
      />
    </article>
  );
}

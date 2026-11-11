import Link from "next/link";
import {
  POSTER_DIMENSIONS,
  type PosterSize,
  posterUrl,
} from "@/catalog/images";
import type { CatalogMovie } from "@/catalog/read/get-movie";
import { movieMeta } from "@/ui/movie-meta";
import { PosterImage } from "@/ui/poster-image";
import { SubtitleBar } from "@/ui/subtitle-bar";

export type MovieCardMovie = Pick<
  CatalogMovie,
  "id" | "title" | "releaseYear" | "posterPath" | "genres"
>;

export type MovieCardProps = {
  movie: MovieCardMovie;
  /** Why this movie is shown. Set as a subtitle at the bottom of the poster. */
  reason?: string;
  /** Makes the whole card a link to this address, through the title. */
  href?: string;
  /** Poster size. `w342` by default; the feed, swipe card and hero use `w500`. */
  posterSize?: PosterSize;
  /**
   * Runs when the link starts a navigation inside the app, and not when the
   * card opens in a new tab. Passed to the `next/link` prop of the same name,
   * so only a client component can set it.
   */
  onNavigate?: () => void;
};

/**
 * A movie as a poster frame, then its title and a small meta line. The poster
 * is the card: there is no box around it. DOM order is poster, reason, title,
 * meta. With `href`, the title is the link and the whole card is clickable
 * (spec 0004, AC-8). The link never prefetches: a feed holds hundreds of
 * cards, and most are never opened (spec 0010, AC-12). It has no server only
 * imports, so it renders on the server or inside a client component such as
 * the feed list (spec 0008).
 */
export function MovieCard({
  movie,
  reason,
  href,
  posterSize = "w342",
  onNavigate,
}: MovieCardProps) {
  const { width, height } = POSTER_DIMENSIONS[posterSize];
  const meta = movieMeta(movie);

  return (
    <article
      data-slot="movie-card"
      className="relative flex flex-col gap-3 has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-screen has-[a:focus-visible]:outline-offset-3"
    >
      <div className="relative overflow-hidden rounded-poster">
        <PosterImage
          src={posterUrl(movie.posterPath, posterSize)}
          alt={`Poster for ${movie.title}`}
          width={width}
          height={height}
          title={movie.title}
        />
        {reason ? <SubtitleBar>{reason}</SubtitleBar> : null}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="type-title">
          {href ? (
            <Link
              href={href}
              prefetch={false}
              onNavigate={onNavigate}
              className="outline-none after:absolute after:inset-0"
            >
              {movie.title}
            </Link>
          ) : (
            movie.title
          )}
        </h3>
        {meta ? <p className="type-small">{meta}</p> : null}
      </div>
    </article>
  );
}

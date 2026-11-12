import { POSTER_DIMENSIONS, posterUrl } from "@/catalog/images";
import type { CatalogMovie } from "@/catalog/read/get-movie";
import type { FeedbackKind } from "@/feedback/feedback";
import { MovieFeedback } from "@/feedback/movie-feedback";
import { PosterImage } from "@/ui/poster-image";
import { SubtitleBar } from "@/ui/subtitle-bar";
import { MovieListActions } from "@/watchlist/movie-list-actions";
import { CAST_TITLE, DIRECTED_BY } from "./constants";
import { castLines, detailMeta, directorNames } from "./format";

/** The movie facts the detail view shows. A `CatalogMovie` fits as it is. */
export type MovieDetailMovie = Pick<
  CatalogMovie,
  | "title"
  | "releaseYear"
  | "runtimeMinutes"
  | "genres"
  | "tagline"
  | "overview"
  | "posterPath"
  | "directors"
  | "cast"
>;

type MovieDetailViewProps = {
  movie: MovieDetailMovie;
  /** The finished reason sentence, or null when the movie has none. */
  reason: string | null;
  /**
   * The feedback controls' first state, or null (the default) for no
   * controls. They need `movieId` too (spec 0011, AC-11).
   */
  feedback?: { kind: FeedbackKind | null } | null;
  movieId?: number;
  /** The signed in user's saved and seen state for this movie. */
  listState?: { watchlisted: boolean; score: number | null };
  showRating?: boolean;
  /**
   * The level of the title heading. 1 on the movie page, where the title is
   * the page's one `h1`. The `/design` page passes 3 to fit under its own
   * headings. The cast heading is always one level below.
   */
  headingLevel?: 1 | 3;
  /**
   * Shown after the synopsis and before the director line: where to watch
   * (spec 0013, AC-1). Its headings are one level below the title's.
   */
  afterOverview?: React.ReactNode;
};

const present = (text: string | null): text is string =>
  text !== null && text.trim() !== "";

/**
 * One movie in full (spec 0010, AC-4 to AC-8 and AC-11). DOM order: the poster
 * with its reason bar, the title, the meta line, the tagline, the synopsis,
 * where to watch (when the page passes it), the director line, the cast. A part with no data is left out, with no
 * placeholder and no empty heading.
 *
 * The reason sits in the same subtitle bar the feed card used, as real page
 * text, in full and with no motion. With no reason there is no bar. The
 * feedback controls sit right under the poster and its reason (spec 0011).
 *
 * Under 1024px it is one column with a poster at most 420px wide. From 1024px
 * the poster is on the left and the text on the right (`detail-grid`).
 */
export function MovieDetailView({
  movie,
  reason,
  feedback = null,
  movieId,
  listState,
  showRating = true,
  headingLevel = 1,
  afterOverview = null,
}: MovieDetailViewProps) {
  const Title = headingLevel === 1 ? "h1" : "h3";
  const CastHeading = headingLevel === 1 ? "h2" : "h4";
  const { width, height } = POSTER_DIMENSIONS.w500;
  const meta = detailMeta(movie);
  const directors = directorNames(movie.directors);
  const cast = castLines(movie.cast);

  return (
    <article data-slot="movie-detail" className="detail-grid">
      <div className="flex flex-col gap-4">
        <div className="relative overflow-hidden rounded-poster">
          <PosterImage
            src={posterUrl(movie.posterPath, "w500")}
            alt={`Poster for ${movie.title}`}
            width={width}
            height={height}
            title={movie.title}
            priority
          />
          {reason ? <SubtitleBar>{reason}</SubtitleBar> : null}
        </div>
        {feedback && movieId !== undefined ? (
          <MovieFeedback
            movie={{ id: movieId, title: movie.title }}
            initial={feedback.kind}
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Title className="type-headline wrap-break-word">{movie.title}</Title>
          {meta ? (
            <p data-slot="movie-meta" className="text-muted-foreground">
              {meta}
            </p>
          ) : null}
        </div>

        {present(movie.tagline) ? (
          <p data-slot="movie-tagline" className="type-title max-w-[62ch]">
            {movie.tagline}
          </p>
        ) : null}

        {present(movie.overview) ? (
          <p data-slot="movie-overview" className="max-w-[62ch]">
            {movie.overview}
          </p>
        ) : null}

        {afterOverview}

        {directors ? (
          <p
            data-slot="movie-directors"
            className="max-w-[62ch] text-muted-foreground"
          >
            {DIRECTED_BY} <span className="text-foreground">{directors}</span>
          </p>
        ) : null}

        {cast.length > 0 ? (
          <section className="flex max-w-[62ch] flex-col gap-3">
            <CastHeading className="type-section">{CAST_TITLE}</CastHeading>
            <ul data-slot="movie-cast" className="flex flex-col">
              {cast.map((member) => (
                <li
                  // One cast row per person and movie (the credits key).
                  key={member.personId}
                  className="border-card border-t py-2 text-muted-foreground"
                >
                  <span className="text-foreground">{member.name}</span>
                  {member.character ? ` as ${member.character}` : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {listState && movieId !== undefined ? (
          <MovieListActions
            movieId={movieId}
            watchlisted={listState.watchlisted}
            score={listState.score}
            showRating={showRating}
          />
        ) : null}
      </div>
    </article>
  );
}

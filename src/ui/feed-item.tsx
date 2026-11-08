import { MovieCard, type MovieCardProps } from "@/ui/movie-card";
import { ReasonReveal } from "@/ui/reason-reveal";

export type FeedItemProps = Omit<MovieCardProps, "reason" | "posterSize"> & {
  /** Why this movie is in the feed. Required, and never empty. */
  reason: string;
};

/**
 * One pick in the feed: a `MovieCard` at the larger poster size whose reason is
 * always shown as a subtitle on the poster, never hidden behind a tap and never
 * cut off (spec 0004, AC-9). The reason is real text on the page. It wipes in
 * the first time it scrolls into view.
 */
export function FeedItem({ reason, ...card }: FeedItemProps) {
  return (
    <ReasonReveal>
      <MovieCard {...card} reason={reason} posterSize="w500" />
    </ReasonReveal>
  );
}

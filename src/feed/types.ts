import type { TasteStrength } from "@/recommend/types";
import type { MovieCardMovie } from "@/ui/movie-card";

/**
 * One feed card: the movie and the finished reason sentence. Plain data
 * (numbers, strings, string lists), so it crosses from server to client safely
 * and the browser never builds a reason from raw rating data.
 */
export type FeedPick = { movie: MovieCardMovie; reason: string };

/**
 * One batch of picks. `strength` is the taste signal behind it. `done` is true
 * when no further batch should be asked for.
 */
export type FeedBatch = {
  picks: FeedPick[];
  strength: TasteStrength;
  done: boolean;
};

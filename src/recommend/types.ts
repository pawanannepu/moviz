import type { DbUnavailable } from "@/db/failure";
import type { MovieCardMovie } from "@/ui/movie-card";

/** The liked movie a pick came from. Always a movie the user rated 6 or higher. */
export type Anchor = {
  movieId: number;
  title: string;
  releaseYear: number | null;
  /** The user's own score for the anchor, 6 to 10. */
  score: number;
};

/**
 * Why a movie was picked. `similar_to_liked` names the liked movie it is close
 * to. `popular` means there was no taste signal to use. The feed words the
 * sentence from `anchor.score`, so a mild 6 is not called a favorite.
 */
export type Reason =
  | { kind: "similar_to_liked"; anchor: Anchor }
  | { kind: "popular" };

/** One recommended movie, shaped so it can go straight into a feed card. */
export type Pick = { movie: MovieCardMovie; reason: Reason };

/** How much taste signal there is: none (0 liked), thin (1 to 4), ok (5 or more). */
export type TasteStrength = "none" | "thin" | "ok";

/**
 * A small summary of the user's taste. The counts are the liked and disliked
 * ratings that have a current embedding, not limited to the anchor cap.
 */
export type TasteProfile = {
  likedCount: number;
  dislikedCount: number;
  strength: TasteStrength;
};

export type Recommendations = { picks: Pick[]; profile: TasteProfile };

export type InvalidInput = { code: "invalid_input" };
export type RecommendError = InvalidInput | DbUnavailable;

import type { Reason } from "@/recommend/types";
import { POPULAR_REASON } from "./constants";

/** The verb that matches how strongly the user rated the anchor: 9 to 10 loved, 7 to 8 liked, otherwise rated. */
function verb(score: number): "loved" | "liked" | "rated" {
  if (score >= 9) return "loved";
  if (score >= 7) return "liked";
  return "rated";
}

/**
 * Words a recommender reason as one subtitle sentence (spec 0008, AC-3):
 * "Because you loved Heat (1995)", "More like Heat (1995), as you asked"
 * (spec 0011, AC-8), or "Popular with film fans". The verb never
 * claims more than the anchor score supports. The year and its parentheses are
 * left out when the year is null. There is no full stop.
 */
export function reasonSentence(reason: Reason): string {
  if (reason.kind === "popular") return POPULAR_REASON;
  const { title, releaseYear } = reason.anchor;
  const year = releaseYear === null ? "" : ` (${releaseYear})`;
  if (reason.kind === "more_like_this") {
    return `More like ${title}${year}, as you asked`;
  }
  return `Because you ${verb(reason.anchor.score)} ${title}${year}`;
}

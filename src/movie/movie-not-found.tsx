import { BackToPicks } from "./back-to-picks";
import { NOT_FOUND_BODY, NOT_FOUND_TITLE } from "./constants";

/**
 * The not found state of the movie page (spec 0010, AC-3): a bad id, an
 * unknown id, or a movie the catalog withdrew. Its "Back to picks" link is
 * always a plain link to `/home`, never a history step. The `/design` page
 * passes heading level 3 to fit under its own headings.
 */
export function MovieNotFound({ headingLevel = 1 }: { headingLevel?: 1 | 3 }) {
  const Title = headingLevel === 1 ? "h1" : "h3";
  return (
    <section
      data-slot="movie-not-found"
      className="flex flex-col items-start gap-4 rounded-sheet bg-card p-8"
    >
      <Title className="type-section">{NOT_FOUND_TITLE}</Title>
      <p className="max-w-[62ch] text-muted-foreground">{NOT_FOUND_BODY}</p>
      <BackToPicks />
    </section>
  );
}

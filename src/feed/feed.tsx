import { db } from "@/db/client";
import { EmptyState } from "@/ui/states/empty-state";
import { EMPTY_BODY, EMPTY_TITLE, NONE_LINE, THIN_LINE } from "./constants";
import { FeedList } from "./feed-list";
import { FeedLoadError } from "./feed-load-error";
import { loadFeedBatch } from "./load-feed-batch";

/**
 * The feed's body (spec 0008). An async server component: it makes the one
 * recommender call for the page load, then renders the early picks line, the
 * empty state, the in page error, or the list. The page wraps it in Suspense,
 * so the header, the heading and a loading state go out first. The caller has
 * already checked the user and the onboarding gate.
 */
export async function Feed({ userId }: { userId: string }) {
  const batch = await loadFeedBatch(db, { userId, shown: [] });
  if (!batch.ok) return <FeedLoadError />;

  const { picks, strength, done } = batch.value;
  if (picks.length === 0) {
    return <EmptyState title={EMPTY_TITLE} body={EMPTY_BODY} />;
  }

  const line =
    strength === "thin" ? THIN_LINE : strength === "none" ? NONE_LINE : null;

  return (
    <>
      {line ? (
        <p
          data-slot="early-picks"
          className="max-w-[62ch] text-muted-foreground"
        >
          {line}
        </p>
      ) : null}
      <FeedList userId={userId} initialPicks={picks} initialDone={done} />
    </>
  );
}

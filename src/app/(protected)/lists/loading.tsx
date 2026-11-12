import { FeedHeader } from "@/feed/feed-header";
import { LoadingState } from "@/ui/states/loading-state";

/** The two personal lists stream in while their first pages load. */
export default function ListsLoading() {
  return (
    <>
      <FeedHeader />
      <div className="page-container flex flex-col gap-8 py-8">
        <h1 className="type-headline">Your lists</h1>
        <LoadingState label="Loading your watchlist and seen list" />
      </div>
    </>
  );
}

"use client";

import { FeedHeader } from "@/feed/feed-header";
import { ErrorState } from "@/ui/states/error-state";

/** Recovery surface for unexpected list page errors. */
export default function ListsError({ reset }: { reset: () => void }) {
  return (
    <>
      <FeedHeader />
      <div className="page-container flex flex-col gap-6 py-8">
        <h1 className="type-headline">Your lists</h1>
        <ErrorState
          title="We couldn't load your lists."
          body="Check your connection and try again."
          onRetry={reset}
          titleAs="h2"
        />
      </div>
    </>
  );
}

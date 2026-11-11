"use client";

import { FeedHeader } from "@/feed/feed-header";
import { BackToPicks } from "@/movie/back-to-picks";
import { LOAD_ERROR_BODY, LOAD_ERROR_TITLE } from "@/movie/constants";
import { ErrorState } from "@/ui/states/error-state";

/**
 * The page level error boundary for `/movie/[id]` (spec 0010, AC-10), for
 * anything thrown. It replaces the whole page, so it draws the header and a
 * plain "Back to picks" link again. It calls `retry`, which fetches the page
 * again; `reset` would only re-render the same failed children. The error is
 * never logged here, because it could name a title or a score (AC-16).
 */
export default function MovieError({ retry }: { retry: () => void }) {
  return (
    <>
      <FeedHeader />
      <div className="page-container flex flex-col gap-6 pt-2 pb-12">
        <BackToPicks />
        <ErrorState
          title={LOAD_ERROR_TITLE}
          body={LOAD_ERROR_BODY}
          onRetry={retry}
          titleAs="h1"
        />
      </div>
    </>
  );
}

"use client";

import { FeedHeader } from "@/feed/feed-header";
import { ERROR_MESSAGE, SEARCH_TITLE } from "@/search/constants";
import { ErrorState } from "@/ui/states/error-state";

/**
 * The page level error boundary for `/search`. It replaces the whole page, so
 * it draws the header and the heading again, and calls `retry`, which fetches
 * the page again. The error is never logged here (spec 0012, AC-15).
 */
export default function SearchError({ retry }: { retry: () => void }) {
  return (
    <>
      <FeedHeader />
      <div className="page-container flex flex-col gap-6 py-6">
        <h1 className="type-section">{SEARCH_TITLE}</h1>
        <ErrorState
          title={ERROR_MESSAGE}
          body="Check your connection and try again."
          onRetry={retry}
        />
      </div>
    </>
  );
}

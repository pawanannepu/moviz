"use client";

import {
  FEED_TITLE,
  LOAD_ERROR_BODY,
  LOAD_ERROR_TITLE,
} from "@/feed/constants";
import { FeedHeader } from "@/feed/feed-header";
import { ErrorState } from "@/ui/states/error-state";

/**
 * The page level error boundary for `/home` (spec 0008, AC-7). It replaces the
 * whole page, so it draws the header and the heading again. It calls `retry`,
 * which fetches the page again; `reset` would only re-render the same failed
 * children. The error is never logged here, because it could name a title or a
 * score (AC-14).
 */
export default function HomeError({ retry }: { retry: () => void }) {
  return (
    <>
      <FeedHeader />
      <div className="page-container flex flex-col gap-6 py-6">
        <h1 className="type-section">{FEED_TITLE}</h1>
        <ErrorState
          title={LOAD_ERROR_TITLE}
          body={LOAD_ERROR_BODY}
          onRetry={retry}
        />
      </div>
    </>
  );
}

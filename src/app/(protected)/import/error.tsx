"use client";

import { ImportHeader } from "@/import/import-header";
import { IMPORT_TITLE } from "@/import/messages";
import { ErrorState } from "@/ui/states/error-state";

/**
 * The page level error boundary for `/import` (spec 0009). It replaces the whole
 * page, so it draws the header and the heading again. It calls `retry`, which
 * fetches the page again. The error is never logged here, because it could name
 * a title or a score.
 */
export default function ImportError({ retry }: { retry: () => void }) {
  return (
    <>
      <ImportHeader />
      <div className="page-container flex flex-col gap-6 py-6">
        <h1 className="type-section">{IMPORT_TITLE}</h1>
        <ErrorState
          title="Couldn't load the import page"
          body="Check your connection and try again."
          onRetry={retry}
        />
      </div>
    </>
  );
}

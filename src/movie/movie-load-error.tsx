"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ErrorState } from "@/ui/states/error-state";
import { LOAD_ERROR_BODY, LOAD_ERROR_TITLE, LOADING_LABEL } from "./constants";

/**
 * The in page error when the movie read returned `db_unavailable` (spec 0010,
 * AC-10). The header and the back link stay above it. "Try again" renders the
 * page again on the server with `router.refresh()`. The old screen stays until
 * the new one arrives, so a polite status says the retry is running and a
 * second press is ignored. The same behavior as the feed's `FeedLoadError`.
 */
export function MovieLoadError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function retry() {
    if (pending) return;
    startTransition(() => router.refresh());
  }

  return (
    <>
      <ErrorState
        title={LOAD_ERROR_TITLE}
        body={LOAD_ERROR_BODY}
        onRetry={retry}
        titleAs="h1"
      />
      <p role="status" className="sr-only">
        {pending ? LOADING_LABEL : ""}
      </p>
    </>
  );
}

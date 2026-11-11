"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ErrorState } from "@/ui/states/error-state";
import { LOAD_ERROR_BODY, LOAD_ERROR_TITLE, LOADING_LABEL } from "./constants";

/**
 * The in page error when the first load returned `db_unavailable` (spec 0008,
 * AC-7). "Try again" re-runs the server render of the page with
 * `router.refresh()`. The old screen stays until the new one arrives, so a
 * polite status says the retry is running and a second press is ignored.
 */
export function FeedLoadError() {
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
      />
      <p role="status" className="sr-only">
        {pending ? LOADING_LABEL : ""}
      </p>
    </>
  );
}

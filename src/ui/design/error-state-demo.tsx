"use client";

import { toast } from "sonner";
import { ErrorState } from "@/ui/states/error-state";

/** The error state on the `/design` page, with a retry that shows a toast. */
export function ErrorStateDemo() {
  return (
    <ErrorState
      title="Couldn't load your picks"
      body="Check your connection and try again."
      onRetry={() => toast("Trying again")}
    />
  );
}

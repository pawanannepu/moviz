"use client";

import { toast } from "sonner";
import { LoadMoreBar, type LoadMoreState } from "@/ui/load-more-bar";

const STATES: { state: LoadMoreState; label: string }[] = [
  { state: "idle", label: "Ready" },
  { state: "pending", label: "Loading" },
  { state: "error", label: "Failed" },
  { state: "session_ended", label: "Signed out" },
  { state: "done", label: "Done" },
];

/** The Load more bar in every state on the `/design` page. Nothing is loaded. */
export function LoadMoreDemo() {
  return (
    <div className="flex flex-col gap-6">
      {STATES.map(({ state, label }) => (
        <div key={state} className="flex flex-col gap-1">
          <p className="type-small">{label}</p>
          <div className="rounded-sheet bg-card">
            <LoadMoreBar
              state={state}
              onLoadMore={() => toast("Loading more picks")}
              signInHref="/sign-in"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

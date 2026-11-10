"use client";

import { ErrorState } from "@/ui/states/error-state";

/** Shown when the deck could not be read, for example while the database is down. */
export default function OnboardingError({ reset }: { reset: () => void }) {
  return (
    <div className="page-container py-8">
      <ErrorState
        title="We couldn't load your movies."
        body="Check your connection and try again."
        onRetry={reset}
      />
    </div>
  );
}

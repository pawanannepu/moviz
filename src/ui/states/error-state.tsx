"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/ui/primitives/button";

type ErrorStateProps = {
  title: string;
  body: string;
  /** Called when the person presses "Try again". */
  onRetry: () => void;
  /**
   * The heading level of the title. `h2` by default. A page whose only
   * heading is this error passes `h1`, so the page still has one.
   */
  titleAs?: "h1" | "h2";
};

/**
 * Shown when something failed. It says what happened and how to fix it, with no
 * apology, and offers one button to try again (spec 0004, AC-14). A client
 * component, so its callers are client components or an `error.tsx`.
 */
export function ErrorState({
  title,
  body,
  onRetry,
  titleAs: Title = "h2",
}: ErrorStateProps) {
  return (
    <section
      role="alert"
      data-slot="error-state"
      className="flex flex-col items-start gap-4 rounded-sheet bg-card p-8"
    >
      <TriangleAlert aria-hidden="true" className="size-6 text-destructive" />
      <Title className="type-section">{title}</Title>
      <p className="max-w-[62ch] text-muted-foreground">{body}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </section>
  );
}

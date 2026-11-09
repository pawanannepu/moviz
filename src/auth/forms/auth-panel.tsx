import type { ReactNode } from "react";

/**
 * The frame every auth page sits in: a Curtain surface, one page heading and
 * the page's content, centred in a narrow column that fits a 320px screen.
 */
export function AuthPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="page-container py-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-sheet bg-card p-6 sm:p-8">
        <h1 className="type-section">{title}</h1>
        {children}
      </div>
    </div>
  );
}

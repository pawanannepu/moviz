import type { ReactNode } from "react";
import { cn } from "@/ui/cn";

/**
 * The subtitle bar: a reason set like a film subtitle at the bottom of a
 * poster. The text is real page text, on a dark bar so it stays readable over
 * any poster. Place it inside a `relative` poster frame.
 */
export function SubtitleBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      data-slot="subtitle-bar"
      className={cn(
        "type-reason absolute inset-x-0 bottom-0 rounded-poster bg-bar px-3 py-2",
        className,
      )}
    >
      {children}
    </p>
  );
}

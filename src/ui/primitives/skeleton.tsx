import type * as React from "react";
import { cn } from "@/ui/cn";

/** A static placeholder block. It does not pulse (spec 0004: motion budget). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded-poster bg-card", className)}
      {...props}
    />
  );
}

export { Skeleton };

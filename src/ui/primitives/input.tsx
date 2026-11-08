import type * as React from "react";
import { cn } from "@/ui/cn";

/** Text input: Curtain surface, Edge border, 44px high, red border when invalid. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "state-change min-h-11 w-full min-w-0 rounded-control border border-input bg-card px-3 py-2 text-base text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

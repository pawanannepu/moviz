"use client";

import { Label as LabelPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/ui/cn";

/** Form label. Always paired with a control through `htmlFor`. */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-base font-medium text-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };

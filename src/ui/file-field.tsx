import type * as React from "react";
import { cn } from "@/ui/cn";
import { Field } from "@/ui/field";

type FileFieldProps = Omit<React.ComponentProps<typeof Field>, "type">;

/**
 * A labelled file picker (spec 0009, AC-14). It is `Field` with `type="file"`,
 * so the label, hint and error are linked the same way, and the native
 * "Choose file" button is restyled to the tokens. The picker stays a real file
 * input, so the keyboard and screen readers work as they always do.
 */
export function FileField({ className, ...props }: FileFieldProps) {
  return (
    <Field
      {...props}
      type="file"
      className={cn(
        "cursor-pointer py-1.5 file:mr-3 file:min-h-8 file:cursor-pointer file:rounded-control file:border file:border-input file:bg-secondary file:px-3 file:text-foreground",
        className,
      )}
    />
  );
}

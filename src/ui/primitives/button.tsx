import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/ui/cn";

/**
 * Button variants (spec 0004). Primary is the next step and is the only
 * yellow control. Destructive uses red text, never a red fill. Every size is
 * at least 44px high so it is easy to hit on a phone.
 */
const buttonVariants = cva(
  "state-change inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed",
        secondary:
          "border border-border bg-transparent text-foreground hover:bg-surface-hover",
        ghost: "bg-transparent text-foreground hover:bg-surface-hover",
        destructive:
          "border border-border bg-transparent text-destructive hover:bg-surface-hover",
      },
      size: {
        default: "min-h-11 px-4 py-2 text-base",
        large: "min-h-12 px-6 py-2 text-lg",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (for example a link) with the button styles. */
    asChild?: boolean;
  };

function Button({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export type { ButtonProps };
export { Button, buttonVariants };

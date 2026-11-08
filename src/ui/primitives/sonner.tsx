"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/*
 * Toasts (spec 0004, AC-6): bottom center, dark, with a visible close button.
 * Sonner's own animations stay as shipped, so this one file is exempt from the
 * motion budget test (AC-19).
 */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      closeButton
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--color-curtain)",
          "--normal-text": "var(--color-screen)",
          "--normal-border": "var(--color-edge)",
          "--border-radius": "var(--radius-sheet)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };

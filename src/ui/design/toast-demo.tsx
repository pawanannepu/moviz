"use client";

import { toast } from "sonner";
import { Button } from "@/ui/primitives/button";

/** Buttons on the `/design` page that show the toast styles. */
export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => toast("Rating saved")}>
        Show a toast
      </Button>
      <Button
        variant="secondary"
        onClick={() => toast.error("Couldn't save your rating. Try again.")}
      >
        Show an error toast
      </Button>
    </div>
  );
}

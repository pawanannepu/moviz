import Link from "next/link";
import { IMPORT_PATH } from "./constants";

/**
 * The link to `/import` that the feed header and the onboarding header share
 * (spec 0009, AC-15). A plain link in the muted text color with a 44px target.
 */
export function ImportLink({ label = "Import" }: { label?: string }) {
  return (
    <Link
      href={IMPORT_PATH}
      className="state-change inline-flex min-h-11 items-center text-muted-foreground underline-offset-8 hover:text-foreground hover:underline"
    >
      {label}
    </Link>
  );
}

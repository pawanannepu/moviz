import Link from "next/link";
import { SignOutButton } from "@/auth/forms/sign-out-button";
import { ImportLink } from "@/import/import-link";

/**
 * The feed's header: the wordmark linking to `/`, the Import link and Sign out. The same shape
 * as the onboarding header. `home/page.tsx` and `home/error.tsx` both use it,
 * because the error page replaces the whole page.
 */
export function FeedHeader() {
  return (
    <header className="page-container flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2">
      <Link href="/" className="type-brand inline-flex min-h-11 items-center">
        Moviz
      </Link>
      <div className="flex flex-wrap items-center gap-x-6">
        <ImportLink />
        <SignOutButton />
      </div>
    </header>
  );
}

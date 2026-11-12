import Link from "next/link";
import { ACCOUNT_PATH } from "@/account/paths";
import { SignOutButton } from "@/auth/forms/sign-out-button";
import { ImportLink } from "@/import/import-link";
import { SEARCH_LINK_LABEL, SEARCH_PATH } from "@/search/constants";

/**
 * The feed's header: the wordmark linking to `/`, the Search by mood, My lists
 * Import and Account (spec 0014, AC-6) links, and Sign out. `/search` uses it too (spec 0012, AC-1). The same shape
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
        <Link
          href={SEARCH_PATH}
          className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-8 hover:text-foreground"
        >
          {SEARCH_LINK_LABEL}
        </Link>
        <Link
          href="/lists"
          className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-8 hover:text-foreground"
        >
          My lists
        </Link>
        <ImportLink />
        <Link
          href={ACCOUNT_PATH}
          className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-8 hover:text-foreground"
        >
          Account
        </Link>
        <SignOutButton />
      </div>
    </header>
  );
}

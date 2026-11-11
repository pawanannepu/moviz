import Link from "next/link";
import { SignOutButton } from "@/auth/forms/sign-out-button";
import { HOME_PATH, ONBOARDING_PATH } from "@/auth/paths";

/**
 * The header of `/import` (spec 0009): the wordmark, a way back to where the
 * user came from, and Sign out. A user who has not finished onboarding goes back
 * to the swipe deck; everyone else goes back to the feed.
 */
export function ImportHeader({ onboarded = true }: { onboarded?: boolean }) {
  return (
    <header className="page-container flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2">
      <Link href="/" className="type-brand inline-flex min-h-11 items-center">
        Moviz
      </Link>
      <div className="flex flex-wrap items-center gap-x-6">
        <Link
          href={onboarded ? HOME_PATH : ONBOARDING_PATH}
          className="state-change inline-flex min-h-11 items-center text-muted-foreground underline-offset-8 hover:text-foreground hover:underline"
        >
          {onboarded ? "Your picks" : "Swipe movies"}
        </Link>
        <SignOutButton />
      </div>
    </header>
  );
}

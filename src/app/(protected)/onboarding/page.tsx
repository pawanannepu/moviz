import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/auth/forms/sign-out-button";
import { HOME_PATH, ONBOARDING_PATH, SIGN_IN_PATH } from "@/auth/paths";
import { requireUser } from "@/auth/session";
import { db } from "@/db/client";
import { ImportLink } from "@/import/import-link";
import { loadDeck } from "@/onboarding/load-deck";
import { OnboardingDeck } from "@/onboarding/onboarding-deck";
import { getProfile } from "@/profile/profile";

export const metadata: Metadata = {
  title: "Rate a few movies · Moviz",
  robots: { index: false, follow: false },
};

/**
 * The first run swipe deck (spec 0006). A user who has already finished goes to
 * `/home`. The header shows the wordmark, the Import link and sign out, and no link to
 * `/home`, because that would send the user straight back here.
 */
export default async function OnboardingPage() {
  const { user } = await requireUser(ONBOARDING_PATH);

  const profile = await getProfile(db, { userId: user.id });
  if (!profile.ok) {
    if (profile.error.code === "user_not_found") redirect(SIGN_IN_PATH);
    throw new Error("The onboarding page could not read the profile.");
  }
  if (profile.value.onboardedAt) redirect(HOME_PATH);

  const deck = await loadDeck(db, { userId: user.id });
  if (!deck.ok) throw new Error("The onboarding page could not load the deck.");
  const { cards, rated, shown } = deck.value;

  return (
    <>
      <header className="page-container flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2">
        <Link href="/" className="type-brand inline-flex min-h-11 items-center">
          Moviz
        </Link>
        <div className="flex flex-wrap items-center gap-x-6">
          <ImportLink label="Import from Letterboxd" />
          <SignOutButton />
        </div>
      </header>
      <OnboardingDeck cards={cards} rated={rated} shown={shown} />
    </>
  );
}

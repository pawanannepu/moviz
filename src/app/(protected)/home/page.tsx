import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPanel } from "@/auth/forms/auth-panel";
import { SignOutButton } from "@/auth/forms/sign-out-button";
import { HOME_PATH, ONBOARDING_PATH, SIGN_IN_PATH } from "@/auth/paths";
import { requireUser } from "@/auth/session";
import { db } from "@/db/client";
import { getProfile } from "@/profile/profile";

export const metadata: Metadata = {
  title: "Home · Moviz",
  robots: { index: false, follow: false },
};

/**
 * The protected placeholder (spec 0005) and the onboarding gate (spec 0006,
 * AC-1): a user who has not finished onboarding is sent to the swipe deck.
 * Feature 9 replaces the page with the feed and keeps the gate.
 */
export default async function HomePage() {
  const { user } = await requireUser(HOME_PATH);

  const profile = await getProfile(db, { userId: user.id });
  if (!profile.ok) {
    if (profile.error.code === "user_not_found") redirect(SIGN_IN_PATH);
    throw new Error("The home page could not read the profile.");
  }
  if (!profile.value.onboardedAt) redirect(ONBOARDING_PATH);

  return (
    <AuthPanel title="You're signed in">
      <p>
        You're signed in as <strong>{user.email}</strong>.
      </p>
      <SignOutButton />
    </AuthPanel>
  );
}

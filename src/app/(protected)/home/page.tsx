import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { HOME_PATH, ONBOARDING_PATH, SIGN_IN_PATH } from "@/auth/paths";
import { requireUser } from "@/auth/session";
import { db } from "@/db/client";
import { FEED_TITLE, LOADING_LABEL, NOSCRIPT_LINE } from "@/feed/constants";
import { Feed } from "@/feed/feed";
import { FeedHeader } from "@/feed/feed-header";
import { getProfile } from "@/profile/profile";
import { LoadingState } from "@/ui/states/loading-state";

export const metadata: Metadata = {
  title: "Your picks · Moviz",
  robots: { index: false, follow: false },
};

/**
 * The personalized feed (spec 0008). The guards run first and before any
 * recommender call: a signed out visitor goes to sign in, a user who has not
 * finished onboarding goes to the swipe deck (spec 0006, AC-1). The header, the
 * heading and a loading state are sent at once; the picks stream in behind the
 * Suspense boundary.
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
    <>
      <FeedHeader />
      <div className="page-container flex flex-col gap-6 py-6">
        <h1 className="type-section">{FEED_TITLE}</h1>
        <noscript>
          <p className="max-w-[62ch] text-muted-foreground">{NOSCRIPT_LINE}</p>
        </noscript>
        <Suspense fallback={<LoadingState label={LOADING_LABEL} />}>
          <Feed userId={user.id} />
        </Suspense>
      </div>
    </>
  );
}

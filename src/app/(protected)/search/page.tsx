import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ONBOARDING_PATH, SIGN_IN_PATH } from "@/auth/paths";
import { requireUser } from "@/auth/session";
import { db } from "@/db/client";
import { FeedHeader } from "@/feed/feed-header";
import { getProfile } from "@/profile/profile";
import { BiteSearch } from "@/search/bite-search";
import { SEARCH_PATH, SEARCH_TITLE } from "@/search/constants";

export const metadata: Metadata = {
  title: "Search by mood · Moviz",
  robots: { index: false, follow: false },
};

/**
 * Bite search (spec 0012, AC-1). The same gates as `/home`: a signed out
 * visitor goes to sign in, a user who has not finished onboarding goes to the
 * swipe deck. The page renders no search itself; the form runs the Server
 * Action, so a reload never spends quota and the phrase never sits in the URL.
 */
export default async function SearchPage() {
  const { user } = await requireUser(SEARCH_PATH);

  const profile = await getProfile(db, { userId: user.id });
  if (!profile.ok) {
    if (profile.error.code === "user_not_found") redirect(SIGN_IN_PATH);
    throw new Error("The search page could not read the profile.");
  }
  if (!profile.value.onboardedAt) redirect(ONBOARDING_PATH);

  return (
    <>
      <FeedHeader />
      <div className="page-container flex flex-col gap-6 py-6">
        <h1 className="type-section">{SEARCH_TITLE}</h1>
        <BiteSearch userId={user.id} />
      </div>
    </>
  );
}

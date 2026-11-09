import type { Metadata } from "next";
import { AuthPanel } from "@/auth/forms/auth-panel";
import { SignOutButton } from "@/auth/forms/sign-out-button";
import { HOME_PATH } from "@/auth/paths";
import { requireUser } from "@/auth/session";

export const metadata: Metadata = {
  title: "Home · Moviz",
  robots: { index: false, follow: false },
};

/**
 * The protected placeholder (spec 0005). It proves a session works end to end.
 * Features 7 and 9 replace it with the swipe deck and the feed.
 */
export default async function HomePage() {
  const { user } = await requireUser(HOME_PATH);

  return (
    <AuthPanel title="You're signed in">
      <p>
        You're signed in as <strong>{user.email}</strong>.
      </p>
      <SignOutButton />
    </AuthPanel>
  );
}

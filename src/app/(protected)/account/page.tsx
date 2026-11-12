import type { Metadata } from "next";
import { DeleteAccountForm } from "@/account/delete-account-form";
import { ACCOUNT_EXPORT_PATH, ACCOUNT_PATH } from "@/account/paths";
import { requireUser } from "@/auth/session";
import { db } from "@/db/client";
import { FeedHeader } from "@/feed/feed-header";
import { getProfile } from "@/profile/profile";
import { Button } from "@/ui/primitives/button";
import { CountryPicker } from "@/watch/country-picker";
import { countryName, countryOptions, toWatchRegion } from "@/watch/regions";

export const metadata: Metadata = {
  title: "Account · Moviz",
  robots: { index: false, follow: false },
};

const SECTION =
  "flex flex-col gap-4 rounded-sheet bg-card p-6 sm:p-8 scroll-mt-6";

/**
 * The Account page (spec 0014, AC-6): the signed in email, then "Your data",
 * "Country" and "Delete account". It does not require onboarding, so a user
 * can leave before swiping.
 */
export default async function AccountPage() {
  const { user } = await requireUser(ACCOUNT_PATH);
  const profile = await getProfile(db, { userId: user.id });
  // Only a country where to watch supports can be shown as selected.
  const country = profile.ok ? toWatchRegion(profile.value.country) : null;

  return (
    <>
      <FeedHeader />
      <div className="page-container flex max-w-3xl flex-col gap-8 py-8">
        <header className="flex flex-col gap-2">
          <h1 className="type-headline">Account</h1>
          <p className="text-muted-foreground">
            Signed in as{" "}
            <strong className="break-all text-foreground">{user.email}</strong>
          </p>
        </header>

        <section aria-labelledby="your-data-heading" className={SECTION}>
          <h2 id="your-data-heading" className="type-section">
            Your data
          </h2>
          <p className="max-w-[62ch] text-muted-foreground">
            Download everything Moviz holds about you as one JSON file: your
            account, ratings, swipes, skips, lists, imports, feedback and
            country.
          </p>
          <Button asChild variant="secondary" className="self-start">
            {/* A plain link: `next/link` would prefetch the route. */}
            <a href={ACCOUNT_EXPORT_PATH} download>
              Download my data
            </a>
          </Button>
        </section>

        <section aria-labelledby="country-heading" className={SECTION}>
          <h2 id="country-heading" className="type-section">
            Country
          </h2>
          <p className="max-w-[62ch] text-muted-foreground">
            Moviz uses your country to show where a movie is streaming.
          </p>
          {profile.ok ? (
            <div className="flex flex-col items-start gap-3">
              <p id="account-country-line" tabIndex={-1}>
                Current country:{" "}
                <strong>{country ? countryName(country) : "Not set"}</strong>
              </p>
              {/* Spec 0014, AC-8: the picker from where to watch (spec 0013). */}
              <CountryPicker
                current={country}
                options={countryOptions()}
                focusTargetId="account-country-line"
              />
            </div>
          ) : (
            <p className="text-muted-foreground">
              Your country could not load. Reload the page to try again.
            </p>
          )}
        </section>

        <section
          aria-labelledby="delete-heading"
          className={`${SECTION} border border-destructive/40`}
        >
          <h2 id="delete-heading" className="type-section">
            Delete account
          </h2>
          <p className="max-w-[62ch] text-muted-foreground">
            This removes your account and every rating, list, import, piece of
            feedback and search count with it. It cannot be undone. Enter your
            password to confirm it is you.
          </p>
          <DeleteAccountForm />
        </section>
      </div>
    </>
  );
}

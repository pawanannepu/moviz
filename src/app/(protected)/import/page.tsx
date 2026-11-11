import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SIGN_IN_PATH } from "@/auth/paths";
import { requireUser } from "@/auth/session";
import { db } from "@/db/client";
import { IMPORT_PATH } from "@/import/constants";
import { getLatestImport } from "@/import/get-latest-import";
import { ImportForm } from "@/import/import-form";
import { ImportHeader } from "@/import/import-header";
import { ImportResult } from "@/import/import-result";
import {
  IMPORT_NOSCRIPT_LINE,
  IMPORT_PROMISE,
  IMPORT_STEPS,
  IMPORT_TITLE,
} from "@/import/messages";
import { getProfile } from "@/profile/profile";

export const metadata: Metadata = {
  title: "Import from Letterboxd · Moviz",
  robots: { index: false, follow: false },
};

/**
 * The Letterboxd import (spec 0009). Open to a user who has not finished
 * onboarding, because the onboarding page links here. The page reads the profile
 * and the latest saved import on the server; the form is the one client piece.
 */
export default async function ImportPage() {
  const { user } = await requireUser(IMPORT_PATH);

  const profile = await getProfile(db, { userId: user.id });
  if (!profile.ok) {
    if (profile.error.code === "user_not_found") redirect(SIGN_IN_PATH);
    throw new Error("The import page could not read the profile.");
  }
  const latest = await getLatestImport(db, { userId: user.id });
  if (!latest.ok) {
    throw new Error("The import page could not read the latest import.");
  }
  const onboarded = Boolean(profile.value.onboardedAt);

  return (
    <>
      <ImportHeader onboarded={onboarded} />
      <div className="page-container flex flex-col gap-8 py-6">
        <div className="flex flex-col gap-3">
          <h1 className="type-section">{IMPORT_TITLE}</h1>
          <p className="max-w-[62ch] text-muted-foreground">{IMPORT_PROMISE}</p>
        </div>
        <section
          aria-labelledby="steps-title"
          className="flex max-w-xl flex-col gap-3 rounded-sheet bg-card p-6"
        >
          <h2 id="steps-title" className="type-title">
            Get your file from Letterboxd
          </h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            {IMPORT_STEPS.map((step) => (
              <li key={step} className="max-w-[62ch]">
                {step}
              </li>
            ))}
          </ol>
        </section>
        <noscript>
          <p className="max-w-[62ch] text-muted-foreground">
            {IMPORT_NOSCRIPT_LINE}
          </p>
        </noscript>
        <ImportForm />
        {latest.value ? (
          <ImportResult latest={latest.value} onboarded={onboarded} />
        ) : null}
      </div>
    </>
  );
}

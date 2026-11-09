import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { toAuthMessage } from "@/auth/auth-errors";
import { AuthPanel } from "@/auth/forms/auth-panel";
import { ResendVerificationForm } from "@/auth/forms/resend-verification";
import { HOME_PATH, SIGN_IN_PATH } from "@/auth/paths";
import { getSession } from "@/auth/session";

export const metadata: Metadata = { title: "Verify email · Moviz" };

/**
 * Where the emailed verification link lands (spec 0005, AC-2). Better Auth
 * does the checking at `/api/auth/verify-email` and then sends the browser
 * here. Three states:
 * - signed in (the link worked and signed the person in): go to the home page;
 * - `?error=` present (expired or invalid link): a message and a form for a new link;
 * - neither (a reused link for an account that is already verified): "Already
 *   verified. Sign in."
 */
export default async function VerifyEmailPage({
  searchParams,
}: PageProps<"/verify-email">) {
  if (await getSession()) redirect(HOME_PATH);

  const { error } = await searchParams;
  const failed = typeof error === "string" || Array.isArray(error);

  if (failed) {
    return (
      <AuthPanel title="This link did not work">
        <p role="alert">{toAuthMessage({ code: "token_expired" })}</p>
        <ResendVerificationForm />
      </AuthPanel>
    );
  }

  return (
    <AuthPanel title="Already verified">
      <p>{toAuthMessage({ code: "already_verified" })}</p>
      <Link
        href={SIGN_IN_PATH}
        className="text-foreground underline underline-offset-4"
      >
        Go to sign in
      </Link>
    </AuthPanel>
  );
}

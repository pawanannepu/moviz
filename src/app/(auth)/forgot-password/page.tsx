import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPanel } from "@/auth/forms/auth-panel";
import { ForgotPasswordForm } from "@/auth/forms/forgot-password-form";
import { HOME_PATH, SIGN_IN_PATH } from "@/auth/paths";
import { getSession } from "@/auth/session";
import { env } from "@/env";

export const metadata: Metadata = { title: "Reset password · Moviz" };

/** Ask for a reset link. A signed in visitor goes to the home page (spec 0005, AC-9). */
export default async function ForgotPasswordPage() {
  if (await getSession()) redirect(HOME_PATH);

  return (
    <AuthPanel title="Reset your password">
      <p>
        Enter your email and we will send you a link to choose a new password.
      </p>
      <ForgotPasswordForm turnstileSiteKey={env.TURNSTILE_SITE_KEY} />
      <p className="type-small">
        Remembered it?{" "}
        <Link href={SIGN_IN_PATH} className="text-foreground underline">
          Sign in
        </Link>
      </p>
    </AuthPanel>
  );
}

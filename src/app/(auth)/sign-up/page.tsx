import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPanel } from "@/auth/forms/auth-panel";
import { SignUpForm } from "@/auth/forms/sign-up-form";
import { HOME_PATH, SIGN_IN_PATH } from "@/auth/paths";
import { getSession } from "@/auth/session";
import { env } from "@/env";

export const metadata: Metadata = { title: "Create account · Moviz" };

/** Sign up. A signed in visitor goes straight to the home page (spec 0005, AC-9). */
export default async function SignUpPage() {
  if (await getSession()) redirect(HOME_PATH);

  return (
    <AuthPanel title="Create your account">
      <SignUpForm turnstileSiteKey={env.TURNSTILE_SITE_KEY} />
      <p className="type-small">
        Already have an account?{" "}
        <Link href={SIGN_IN_PATH} className="text-foreground underline">
          Sign in
        </Link>
      </p>
    </AuthPanel>
  );
}

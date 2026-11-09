import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { noticeFor } from "@/auth/auth-errors";
import { AuthPanel } from "@/auth/forms/auth-panel";
import { SignInForm } from "@/auth/forms/sign-in-form";
import { HOME_PATH, SIGN_UP_PATH } from "@/auth/paths";
import { safeReturnPath } from "@/auth/return-path";
import { getSession } from "@/auth/session";

export const metadata: Metadata = { title: "Sign in · Moviz" };

/** First value of a query param that may repeat. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Sign in. A signed in visitor goes straight to the home page (spec 0005,
 * AC-9). `?returnTo=` is passed through `safeReturnPath`, and `?notice=` only
 * shows fixed copy for known keys.
 */
export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  if (await getSession()) redirect(HOME_PATH);

  const params = await searchParams;
  const returnTo = safeReturnPath(first(params.returnTo));
  const notice = noticeFor(first(params.notice));

  return (
    <AuthPanel title="Sign in">
      {notice ? (
        <p
          role="status"
          className="rounded-control border border-border p-3 text-foreground"
        >
          {notice}
        </p>
      ) : null}
      <SignInForm returnTo={returnTo} />
      <p className="type-small">
        New here?{" "}
        <Link href={SIGN_UP_PATH} className="text-foreground underline">
          Create an account
        </Link>
      </p>
    </AuthPanel>
  );
}

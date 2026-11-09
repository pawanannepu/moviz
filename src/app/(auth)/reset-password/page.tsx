import type { Metadata } from "next";
import { AuthPanel } from "@/auth/forms/auth-panel";
import {
  ExpiredResetLink,
  ResetPasswordForm,
} from "@/auth/forms/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password · Moviz" };

/** First value of a query param that may repeat. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Where the emailed reset link lands (spec 0005, AC-6). Better Auth checks the
 * link at `/api/auth/reset-password/<token>` and then redirects here with
 * `?token=` (good) or `?error=` (expired or unknown). With no token, or an
 * error, the person sees a clear message and a way to ask again.
 *
 * Public on purpose: a signed in person may reset too. The response carries
 * `Referrer-Policy: no-referrer` (see `next.config.ts`), and the form removes
 * the token from the address bar once it has mounted.
 */
export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = first(params.token);

  if (first(params.error) !== undefined || !token) {
    return (
      <AuthPanel title="This link did not work">
        <ExpiredResetLink />
      </AuthPanel>
    );
  }

  return (
    <AuthPanel title="Choose a new password">
      <ResetPasswordForm token={token} />
    </AuthPanel>
  );
}

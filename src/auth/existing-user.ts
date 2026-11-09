import type { EmailContent } from "@/email/templates";
import { accountExistsContent } from "@/email/templates";
import { FORGOT_PASSWORD_PATH, SIGN_IN_PATH } from "./paths";

type ExistingUser = { email: string; emailVerified: boolean };

type Dependencies = {
  /** The origin for links in the "account exists" email, or undefined if unknown. */
  origin: string | undefined;
  /** Sends one email. Must not throw; this function guards it anyway. */
  send: (message: EmailContent & { to: string }) => Promise<unknown>;
  /** Starts the library's own password reset email for an address. */
  requestReset: (email: string) => Promise<unknown>;
};

/**
 * What happens when someone signs up with an email that already has an account
 * (spec 0005, AC-7). The sign up response is already neutral; this only does
 * the quiet follow up, after the response:
 *
 * - verified account: tell its owner that an account exists, with sign in and
 *   reset links;
 * - unverified account: send a password reset email instead, so a stranger who
 *   signed up with someone else's address cannot keep the account. The real
 *   owner resets, which also marks the email verified.
 *
 * It never throws and logs nothing that holds the address, so a failure cannot
 * show up as a different outcome for an existing and an unknown email (AC-14).
 */
export async function handleExistingUserSignUp(
  user: ExistingUser,
  deps: Dependencies,
): Promise<void> {
  try {
    if (!user.emailVerified) {
      await deps.requestReset(user.email);
      return;
    }
    if (!deps.origin) {
      console.error("[auth] account exists email skipped: no site origin");
      return;
    }
    await deps.send({
      to: user.email,
      ...accountExistsContent({
        signInUrl: new URL(SIGN_IN_PATH, deps.origin).href,
        resetUrl: new URL(FORGOT_PASSWORD_PATH, deps.origin).href,
      }),
    });
  } catch (error) {
    console.error(
      `[auth] existing user follow up failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  }
}

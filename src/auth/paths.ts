/**
 * Route constants for the auth feature (spec 0005). Pure and safe to import
 * from client components and from `src/proxy.ts`.
 */

/** Where a signed in user lands. Specs 7 and 9 point this at the swipe deck or the feed. */
export const HOME_PATH = "/home";

/** Where "Start swiping" goes. */
export const SIGN_UP_PATH = "/sign-up";

/** Where "Sign in" goes. */
export const SIGN_IN_PATH = "/sign-in";

/** Landing page of the emailed verification link. */
export const VERIFY_EMAIL_PATH = "/verify-email";

/** Page that asks for a password reset email. */
export const FORGOT_PASSWORD_PATH = "/forgot-password";

/** Page the emailed reset link lands on. */
export const RESET_PASSWORD_PATH = "/reset-password";

/** Where a person lands after setting a new password; the sign in page shows the notice. */
export const PASSWORD_UPDATED_PATH = `${SIGN_IN_PATH}?notice=password-updated`;

/** Where a signed out visitor goes after signing out. */
export const SIGNED_OUT_PATH = "/";

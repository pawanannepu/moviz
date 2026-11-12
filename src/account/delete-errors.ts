/**
 * Maps what Better Auth's `deleteUser` returns to one plain message
 * (spec 0014, AC-11). Pure, so the form and its tests share it.
 */

export type DeleteAccountError =
  | { code: "password_required" }
  | { code: "wrong_password" }
  | { code: "rate_limited" }
  | { code: "unexpected" };

/** Turns a Better Auth client error into a typed `DeleteAccountError`. */
export function toDeleteAccountError(raw: {
  code?: string | undefined;
  status?: number | undefined;
}): DeleteAccountError {
  if (raw.status === 429) return { code: "rate_limited" };
  const code = raw.code?.toUpperCase();
  if (code === "PASSWORD_REQUIRED") return { code: "password_required" };
  if (code === "INVALID_PASSWORD") return { code: "wrong_password" };
  return { code: "unexpected" };
}

/** The field error for an empty password. */
export const PASSWORD_REQUIRED_MESSAGE = "Enter your password.";

/** The one line shown above the button for each failure. */
export function toDeleteAccountMessage(error: DeleteAccountError): string {
  switch (error.code) {
    case "password_required":
      return PASSWORD_REQUIRED_MESSAGE;
    case "wrong_password":
      return "That password is not right.";
    case "rate_limited":
      return "Too many tries. Wait a minute and try again.";
    case "unexpected":
      return "Could not delete your account. Try again.";
  }
}

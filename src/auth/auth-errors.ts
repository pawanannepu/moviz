/**
 * Maps what Better Auth returns to one typed error and one plain message
 * (spec 0005, AC-10). No raw library code or message ever reaches the screen.
 * Pure, so client forms and tests share it.
 */

export type AuthError =
  | { code: "invalid_credentials" }
  | { code: "email_not_verified" }
  | { code: "rate_limited"; seconds: number }
  | { code: "captcha_failed" }
  | { code: "invalid_input" }
  | { code: "token_expired" }
  | { code: "already_verified" }
  | { code: "unexpected" };

/** The parts of a Better Auth client error this mapping reads. */
export type RawAuthError = {
  /** Better Auth's machine code, for example `INVALID_EMAIL_OR_PASSWORD`. */
  code?: string | undefined;
  status?: number | undefined;
  /** Seconds from the `X-Retry-After` header on a 429, when present. */
  retryAfterSeconds?: number | undefined;
};

/** Used when a 429 arrives without a usable `X-Retry-After`. */
const DEFAULT_RETRY_SECONDS = 60;

const INVALID_INPUT_CODES = new Set([
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
  "INVALID_EMAIL",
  "INVALID_PASSWORD",
  "VALIDATION_ERROR",
  "FAILED_TO_CREATE_USER",
]);

const CAPTCHA_CODES = new Set([
  "MISSING_RESPONSE",
  "VERIFICATION_FAILED",
  "SERVICE_UNAVAILABLE",
  "UNKNOWN_ERROR",
]);

/** Turns a Better Auth error into a typed `AuthError`. */
export function toAuthError(raw: RawAuthError): AuthError {
  const code = raw.code?.toUpperCase();

  if (raw.status === 429) {
    const seconds = raw.retryAfterSeconds;
    return {
      code: "rate_limited",
      seconds:
        seconds !== undefined && Number.isFinite(seconds) && seconds > 0
          ? Math.ceil(seconds)
          : DEFAULT_RETRY_SECONDS,
    };
  }
  if (code === "EMAIL_NOT_VERIFIED") return { code: "email_not_verified" };
  if (code === "INVALID_EMAIL_OR_PASSWORD") {
    return { code: "invalid_credentials" };
  }
  if (code === "TOKEN_EXPIRED" || code === "INVALID_TOKEN") {
    return { code: "token_expired" };
  }
  if (code !== undefined && CAPTCHA_CODES.has(code)) {
    return { code: "captcha_failed" };
  }
  if (code !== undefined && INVALID_INPUT_CODES.has(code)) {
    return { code: "invalid_input" };
  }
  if (raw.status === 401) return { code: "invalid_credentials" };
  if (raw.status === 422) return { code: "invalid_input" };
  return { code: "unexpected" };
}

/** The one plain message for each error. */
export function toAuthMessage(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Email or password is wrong.";
    case "email_not_verified":
      return "Verify your email first. We can send the link again.";
    case "rate_limited":
      return `Too many attempts. Try again in ${error.seconds} ${error.seconds === 1 ? "second" : "seconds"}.`;
    case "captcha_failed":
      return "We could not confirm you are a person. Try again.";
    case "invalid_input":
      return "Check your email and password (at least 8 characters) and try again.";
    case "token_expired":
      return "This link has expired or was already used. Ask for a new one.";
    case "already_verified":
      return "Already verified. Sign in.";
    case "unexpected":
      return "Something went wrong. Try again in a moment.";
  }
}

/**
 * The fixed copy for the `?notice=` query value. Only known keys render;
 * anything else is ignored, so a link cannot put arbitrary text on the page.
 */
export const AUTH_NOTICES = {
  "password-updated": "Password updated. Sign in.",
} as const;

export type AuthNoticeKey = keyof typeof AUTH_NOTICES;

/** Returns the notice text for a query value, or null for an unknown one. */
export function noticeFor(value: string | undefined): string | null {
  if (value !== undefined && Object.hasOwn(AUTH_NOTICES, value)) {
    return AUTH_NOTICES[value as AuthNoticeKey];
  }
  return null;
}

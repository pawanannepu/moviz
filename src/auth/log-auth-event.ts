/**
 * The auth events that get a log line (spec 0005, AC-16). `data_exported` is
 * the account data download (spec 0014, AC-7).
 */
export type AuthEventName =
  | "sign_up"
  | "email_verified"
  | "sign_in"
  | "sign_out"
  | "reset_requested"
  | "reset_completed"
  | "account_deleted"
  | "data_exported";

export type AuthEvent = {
  event: AuthEventName;
  /** A short code such as `ok`, `invalid_credentials` or `email_not_verified`. */
  outcome: string;
  /** The user id, when it is known. Never an email. */
  userId?: string;
};

/**
 * Builds the log line for an auth event. Pure. A line holds the event name, the
 * outcome code, the time and the user id when known, and nothing else: no
 * email, password, token or IP address can reach it because there is no field
 * for them.
 */
export function formatAuthEvent(
  input: AuthEvent,
  now: Date = new Date(),
): string {
  return JSON.stringify({
    type: "auth",
    event: input.event,
    outcome: input.outcome,
    at: now.toISOString(),
    ...(input.userId ? { userId: input.userId } : {}),
  });
}

/** Writes one structured line to the server log. Never throws. */
export function logAuthEvent(input: AuthEvent): void {
  try {
    console.info(formatAuthEvent(input));
  } catch {
    // Logging must never change the outcome of a request.
  }
}

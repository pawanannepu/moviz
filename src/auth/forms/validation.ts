/** Shortest password the server accepts (spec 0005, AC-1). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * A quick check that catches typos before a request is sent. It is not the real
 * rule: the server decides. Pure.
 */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export type CredentialErrors = { email?: string; password?: string };

/** Checks the email and password fields. Returns an empty object when both pass. */
export function validateCredentials(input: {
  email: string;
  password: string;
}): CredentialErrors {
  const errors: CredentialErrors = {};
  if (!isPlausibleEmail(input.email)) {
    errors.email = "Enter a valid email, like name@example.com.";
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return errors;
}

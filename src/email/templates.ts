/**
 * Auth email templates (spec 0005). Pure functions: a link in, a subject plus
 * plain text and HTML out. One link each, no images, no tracking. The HTML is
 * dark to match the app (design.md): Pit background, Screen text, Subtitle yellow
 * for the one call to action.
 */

export type EmailContent = { subject: string; text: string; html: string };

const PIT = "#170b10";
const SCREEN = "#efe9df";
const SUBTITLE = "#f5d547";
const DUST = "#b8a5ac";

/** Escapes text for use inside HTML text and attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(input: {
  heading: string;
  body: string;
  action: string;
  url: string;
  footer: string;
  /** An optional second link, shown as plain text under the button. */
  secondary?: { label: string; url: string };
}): string {
  const url = escapeHtml(input.url);
  const secondary = input.secondary
    ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.5;"><a href="${escapeHtml(input.secondary.url)}" style="color:${SCREEN};">${escapeHtml(input.secondary.label)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:${PIT};color:${SCREEN};font-family:Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
      <tr><td>
        <p style="margin:0 0 24px;font-size:20px;font-weight:700;">Moviz</p>
        <h1 style="margin:0 0 12px;font-size:22px;">${escapeHtml(input.heading)}</h1>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">${escapeHtml(input.body)}</p>
        <p style="margin:0 0 24px;">
          <a href="${url}" style="display:inline-block;padding:12px 20px;background:${SUBTITLE};color:${PIT};font-weight:700;text-decoration:none;border-radius:6px;">${escapeHtml(input.action)}</a>
        </p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:${DUST};">Or paste this link into your browser:</p>
        <p style="margin:0 0 24px;font-size:14px;word-break:break-all;"><a href="${url}" style="color:${SCREEN};">${url}</a></p>
        ${secondary}
        <p style="margin:0;font-size:14px;line-height:1.5;color:${DUST};">${escapeHtml(input.footer)}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** The email that carries the verification link. Valid for 24 hours. */
export function verifyEmailContent(input: { url: string }): EmailContent {
  const body = "Confirm this email address to finish creating your account.";
  const footer =
    "This link works for 24 hours. If you did not sign up, ignore this email.";
  return {
    subject: "Confirm your email for Moviz",
    text: `${body}\n\n${input.url}\n\n${footer}`,
    html: layout({
      heading: "Confirm your email",
      body,
      action: "Confirm email",
      url: input.url,
      footer,
    }),
  };
}

/** The email that carries the password reset link. Works for 15 minutes, once. */
export function resetPasswordContent(input: { url: string }): EmailContent {
  const body = "Use this link to choose a new password for your Moviz account.";
  const footer =
    "This link works for 15 minutes and only once. If you did not ask for it, ignore this email and your password stays as it is.";
  return {
    subject: "Reset your Moviz password",
    text: `${body}\n\n${input.url}\n\n${footer}`,
    html: layout({
      heading: "Choose a new password",
      body,
      action: "Reset password",
      url: input.url,
      footer,
    }),
  };
}

/**
 * Sent to the owner of a verified account when someone signs up with their
 * address (spec 0005, AC-7). It names no one and holds no token: just a link to
 * sign in and a link to reset the password.
 */
export function accountExistsContent(input: {
  signInUrl: string;
  resetUrl: string;
}): EmailContent {
  const body =
    "Someone tried to create a Moviz account with this email address, but an account already exists.";
  const footer =
    "If this was you, sign in or reset your password. If it was not, you can ignore this email: nothing changed.";
  return {
    subject: "You already have a Moviz account",
    text: `${body}\n\nSign in: ${input.signInUrl}\nForgot your password? ${input.resetUrl}\n\n${footer}`,
    html: layout({
      heading: "You already have an account",
      body,
      action: "Sign in",
      url: input.signInUrl,
      footer,
      secondary: { label: "Forgot your password?", url: input.resetUrl },
    }),
  };
}

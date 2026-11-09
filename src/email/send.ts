import { Resend } from "resend";
import { env } from "@/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailError = { code: "email_not_sent" };

export type EmailResult = { ok: true } | { ok: false; error: EmailError };

/**
 * Where an email goes. `console` is only for local development, where
 * `VERCEL_ENV` is unset: the link is printed instead of mailed. On Vercel a
 * missing sender is a boot error (`src/env.ts`), because printing a token would
 * put it in hosted logs (spec 0005, AC-14).
 */
export type EmailTransport = "resend" | "console" | "none";

/** Pure: picks the transport from the environment values. */
export function pickTransport(settings: {
  resendApiKey: string | undefined;
  emailFrom: string | undefined;
  vercelEnv: string | undefined;
}): EmailTransport {
  if (settings.resendApiKey && settings.emailFrom) return "resend";
  return settings.vercelEnv === undefined ? "console" : "none";
}

/**
 * Sends one email and returns a typed result. It never throws, so a failed send
 * cannot show up as a different response for an existing and an unknown email
 * (spec 0005, AC-14). Callers run it after the response is sent.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  try {
    const transport = pickTransport({
      resendApiKey: env.RESEND_API_KEY,
      emailFrom: env.EMAIL_FROM,
      vercelEnv: env.VERCEL_ENV,
    });

    if (transport === "console") {
      // Local development only: the link is the whole point of the email.
      console.info(
        `\n[email] to: ${message.to}\n[email] subject: ${message.subject}\n${message.text}\n`,
      );
      return { ok: true };
    }

    if (transport === "none" || !env.RESEND_API_KEY || !env.EMAIL_FROM) {
      return fail("no sender configured");
    }

    const resend = new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    // Resend's error names are safe to log; the address and content are not.
    return error ? fail(`resend ${error.name}`) : { ok: true };
  } catch {
    return fail("unexpected error");
  }
}

/** Logs why a send failed, without the address or the content, and returns the typed error. */
function fail(reason: string): EmailResult {
  console.error(`[email] send failed: ${reason}`);
  return { ok: false, error: { code: "email_not_sent" } };
}

"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { toAuthError, toAuthMessage } from "@/auth/auth-errors";
import { authClient } from "@/auth/client";
import { RESET_PASSWORD_PATH } from "@/auth/paths";
import { Field } from "@/ui/field";
import { Button } from "@/ui/primitives/button";
import { readRetryAfter } from "./retry-after";
import { Turnstile, type TurnstileHandle } from "./turnstile";
import { isPlausibleEmail } from "./validation";

/**
 * Asks for a password reset email (spec 0005, AC-6). The answer is the same
 * neutral message for every address, so nobody can use this form to find out
 * who has an account. Better Auth builds the link and redirects the browser to
 * the reset page when the link is opened.
 */
export function ForgotPasswordForm({
  turnstileSiteKey,
}: {
  turnstileSiteKey: string;
}) {
  const turnstile = useRef<TurnstileHandle>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Focus moves to the first thing that needs attention.
  useEffect(() => {
    if (emailError) emailRef.current?.focus();
    else if (formError) alertRef.current?.focus();
  }, [emailError, formError]);

  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const email = String(
      new FormData(event.currentTarget).get("email") ?? "",
    ).trim();

    if (!isPlausibleEmail(email)) {
      setEmailError("Enter a valid email, like name@example.com.");
      setFormError(null);
      return;
    }

    const captchaToken = turnstile.current?.token() ?? null;
    if (!captchaToken) {
      setEmailError(undefined);
      setFormError(toAuthMessage({ code: "captcha_failed" }));
      return;
    }

    submitting.current = true;
    setPending(true);
    setEmailError(undefined);
    setFormError(null);

    let retryAfterSeconds: number | undefined;
    try {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: RESET_PASSWORD_PATH,
        fetchOptions: {
          headers: { "x-captcha-response": captchaToken },
          onError: (context) => {
            retryAfterSeconds = readRetryAfter(context.response);
          },
        },
      });
      if (error) {
        setFormError(
          toAuthMessage(
            toAuthError({
              code: error.code,
              status: error.status,
              retryAfterSeconds,
            }),
          ),
        );
        return;
      }
      setSent(true);
    } catch {
      setFormError(toAuthMessage({ code: "unexpected" }));
    } finally {
      // A token works once, so ask for a new one after every response.
      turnstile.current?.reset();
      submitting.current = false;
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div
        ref={sentRef}
        tabIndex={-1}
        role="status"
        className="flex flex-col gap-4 outline-offset-4"
      >
        <h2 className="type-title">Check your inbox</h2>
        <p>
          If that email can be used, we sent a link to reset your password. It
          works for 15 minutes.
        </p>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setSent(false)}
          className="self-start"
        >
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      method="post"
      noValidate
      aria-busy={pending}
      className="flex flex-col gap-5"
    >
      {formError ? (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="rounded-control border border-destructive p-3 text-destructive"
        >
          {formError}
        </div>
      ) : null}
      <Field
        ref={emailRef}
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        error={emailError}
      />
      <Turnstile ref={turnstile} siteKey={turnstileSiteKey} />
      <Button type="submit" size="large" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

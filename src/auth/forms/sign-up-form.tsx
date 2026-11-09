"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { toAuthError, toAuthMessage } from "@/auth/auth-errors";
import { authClient } from "@/auth/client";
import { nameFromEmail } from "@/auth/name-from-email";
import { VERIFY_EMAIL_PATH } from "@/auth/paths";
import { Field } from "@/ui/field";
import { Button } from "@/ui/primitives/button";
import { PasswordField } from "./password-field";
import { ResendVerificationButton } from "./resend-verification";
import { readRetryAfter } from "./retry-after";
import { Turnstile, type TurnstileHandle } from "./turnstile";
import { type CredentialErrors, validateCredentials } from "./validation";

/**
 * Sign up: an email and a password, nothing else (spec 0005, AC-1). A good
 * answer swaps the form for "check your inbox" in place and issues no session.
 * It calls Better Auth's own route, so the library's checks run, including the
 * Turnstile bot check, whose token is sent in the `x-captcha-response` header.
 */
export function SignUpForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const turnstile = useRef<TurnstileHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<CredentialErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Focus moves to the first thing that needs attention.
  useEffect(() => {
    if (!errors.email && !errors.password && !formError) return;
    const firstInvalid = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    if (firstInvalid) firstInvalid.focus();
    else alertRef.current?.focus();
  }, [errors, formError]);

  useEffect(() => {
    if (sentTo) sentRef.current?.focus();
  }, [sentTo]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    const found = validateCredentials({ email, password });
    if (found.email || found.password) {
      setErrors(found);
      setFormError(null);
      return;
    }

    const captchaToken = turnstile.current?.token() ?? null;
    if (!captchaToken) {
      setErrors({});
      setFormError(toAuthMessage({ code: "captcha_failed" }));
      return;
    }

    submitting.current = true;
    setPending(true);
    setErrors({});
    setFormError(null);
    let retryAfterSeconds: number | undefined;
    try {
      const { error } = await authClient.signUp.email({
        email,
        password,
        name: nameFromEmail(email),
        callbackURL: VERIFY_EMAIL_PATH,
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
      setSentTo(email);
    } catch {
      setFormError(toAuthMessage({ code: "unexpected" }));
    } finally {
      // A token works once, so ask for a new one after every response.
      turnstile.current?.reset();
      submitting.current = false;
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <div
        ref={sentRef}
        tabIndex={-1}
        role="status"
        className="flex flex-col gap-4 outline-offset-4"
      >
        <h2 className="type-title">Check your inbox</h2>
        <p>
          We sent a link to <strong>{sentTo}</strong>. Open it to confirm your
          email. It works for 24 hours.
        </p>
        <ResendVerificationButton email={sentTo} />
        <Button
          type="button"
          variant="ghost"
          onClick={() => setSentTo(null)}
          className="self-start"
        >
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
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
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        error={errors.email}
      />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        required
        error={errors.password}
      />
      <Turnstile ref={turnstile} siteKey={turnstileSiteKey} />
      <Button type="submit" size="large" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

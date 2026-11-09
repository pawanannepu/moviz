"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toAuthError, toAuthMessage } from "@/auth/auth-errors";
import { authClient } from "@/auth/client";
import { FORGOT_PASSWORD_PATH } from "@/auth/paths";
import { safeReturnPath } from "@/auth/return-path";
import { Field } from "@/ui/field";
import { Button } from "@/ui/primitives/button";
import { PasswordField } from "./password-field";
import { ResendVerificationButton } from "./resend-verification";
import { readRetryAfter } from "./retry-after";
import { type CredentialErrors, isPlausibleEmail } from "./validation";

/** Where an unverified person is told a fresh link was sent. */
type Unverified = { email: string; attempt: number };

/**
 * Sign in (spec 0005, AC-3, AC-4). A right password on a verified account
 * starts a 30 day session and moves the browser to the page the person tried
 * to reach by a full page navigation, so no stale page is cached. A wrong
 * password and an unknown email give the same message. An unverified account
 * gets a panel with a resend button; the attempt itself already sent a link.
 */
export function SignInForm({ returnTo }: { returnTo: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const unverifiedRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const attempts = useRef(0);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<CredentialErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<Unverified | null>(null);

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
    if (unverified) unverifiedRef.current?.focus();
  }, [unverified]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    // Read again here: a hidden field is only as safe as this check.
    const destination = safeReturnPath(String(data.get("returnTo") ?? ""));

    // Sign in only needs both fields filled. The server judges the password,
    // so a short wrong password gets the same message as any wrong one.
    const found: CredentialErrors = {};
    if (!isPlausibleEmail(email)) {
      found.email = "Enter a valid email, like name@example.com.";
    }
    if (password === "") found.password = "Enter your password.";
    if (found.email || found.password) {
      setErrors(found);
      setFormError(null);
      setUnverified(null);
      return;
    }

    submitting.current = true;
    setPending(true);
    setErrors({});
    setFormError(null);
    setUnverified(null);

    let retryAfterSeconds: number | undefined;
    let navigating = false;
    try {
      const { error } = await authClient.signIn.email({
        email,
        password,
        fetchOptions: {
          onError: (context) => {
            retryAfterSeconds = readRetryAfter(context.response);
          },
        },
      });
      if (!error) {
        // Keep the button disabled until the browser has moved.
        navigating = true;
        window.location.assign(destination);
        return;
      }
      const mapped = toAuthError({
        code: error.code,
        status: error.status,
        retryAfterSeconds,
      });
      if (mapped.code === "email_not_verified") {
        attempts.current += 1;
        setUnverified({ email, attempt: attempts.current });
      } else {
        setFormError(toAuthMessage(mapped));
      }
    } catch {
      setFormError(toAuthMessage({ code: "unexpected" }));
    } finally {
      if (!navigating) {
        submitting.current = false;
        setPending(false);
      }
    }
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
      <input type="hidden" name="returnTo" value={returnTo} />
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
      {unverified ? (
        <div
          ref={unverifiedRef}
          tabIndex={-1}
          role="alert"
          className="flex flex-col gap-3 rounded-control border border-border p-4 outline-offset-4"
        >
          <p>{toAuthMessage({ code: "email_not_verified" })}</p>
          <p>
            We just sent a fresh link to <strong>{unverified.email}</strong>.
          </p>
          <ResendVerificationButton
            key={unverified.attempt}
            email={unverified.email}
            waitFirst
          />
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
        autoComplete="current-password"
        required
        error={errors.password}
      />
      <Button type="submit" size="large" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <Link
        href={FORGOT_PASSWORD_PATH}
        className="inline-flex min-h-11 items-center self-start text-foreground underline underline-offset-4"
      >
        Forgot your password?
      </Link>
    </form>
  );
}

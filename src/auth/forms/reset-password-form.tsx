"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toAuthError, toAuthMessage } from "@/auth/auth-errors";
import { authClient } from "@/auth/client";
import {
  FORGOT_PASSWORD_PATH,
  PASSWORD_UPDATED_PATH,
  RESET_PASSWORD_PATH,
} from "@/auth/paths";
import { Button } from "@/ui/primitives/button";
import { PasswordField } from "./password-field";
import { readRetryAfter } from "./retry-after";
import { MIN_PASSWORD_LENGTH } from "./validation";

/** The message and the way forward for a link that is expired, used or wrong. */
export function ExpiredResetLink() {
  return (
    <div className="flex flex-col gap-4">
      <p role="alert">{toAuthMessage({ code: "token_expired" })}</p>
      <Link
        href={FORGOT_PASSWORD_PATH}
        className="inline-flex min-h-11 items-center self-start text-foreground underline underline-offset-4"
      >
        Ask for a new link
      </Link>
    </div>
  );
}

/**
 * Sets a new password from an emailed link (spec 0005, AC-6). The token comes
 * from the page's address, which Better Auth filled in when it redirected here.
 * The form removes it from the address bar as soon as it has mounted, so it
 * does not sit in history or get copied by accident. A good answer signs out
 * every device and sends the person to the sign in page with a notice.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  // The token lives in this component from now on, not in the address bar.
  useEffect(() => {
    window.history.replaceState(null, "", RESET_PASSWORD_PATH);
  }, []);

  // Focus moves to the first thing that needs attention.
  useEffect(() => {
    if (!passwordError && !formError) return;
    const firstInvalid = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    if (firstInvalid) firstInvalid.focus();
    else alertRef.current?.focus();
  }, [passwordError, formError]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const newPassword = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      setFormError(null);
      return;
    }

    submitting.current = true;
    setPending(true);
    setPasswordError(undefined);
    setFormError(null);

    let retryAfterSeconds: number | undefined;
    let navigating = false;
    try {
      const { error } = await authClient.resetPassword({
        newPassword,
        token,
        fetchOptions: {
          onError: (context) => {
            retryAfterSeconds = readRetryAfter(context.response);
          },
        },
      });
      if (!error) {
        // Keep the button disabled until the browser has moved.
        navigating = true;
        window.location.assign(PASSWORD_UPDATED_PATH);
        return;
      }
      const mapped = toAuthError({
        code: error.code,
        status: error.status,
        retryAfterSeconds,
      });
      if (mapped.code === "token_expired") {
        setExpired(true);
      } else if (mapped.code === "invalid_input") {
        setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
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

  if (expired) return <ExpiredResetLink />;

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
      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        required
        error={passwordError}
      />
      <Button type="submit" size="large" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}

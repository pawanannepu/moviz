"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { authClient } from "@/auth/client";
import { PasswordField } from "@/auth/forms/password-field";
import { Button } from "@/ui/primitives/button";
import {
  PASSWORD_REQUIRED_MESSAGE,
  toDeleteAccountError,
  toDeleteAccountMessage,
} from "./delete-errors";
import { ACCOUNT_DELETED_PATH } from "./paths";

/**
 * Deletes the account after the current password (spec 0014, AC-9 to AC-11).
 * Better Auth checks the session and the password, then runs `deleteAccount`
 * in one transaction. On success a full page load goes to `/?deleted=1`, so
 * every in memory store is dropped. On failure one line shows above the
 * button and takes focus; an empty password is a field error instead.
 */
export function DeleteAccountForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  // Bumped on every failure, so focus moves even when the message repeats.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt === 0) return;
    if (fieldError) {
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    } else if (formError) {
      alertRef.current?.focus();
    }
  }, [attempt, fieldError, formError]);

  function failWith(field: string | undefined, form: string | null) {
    setFieldError(field);
    setFormError(form);
    setAttempt((value) => value + 1);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    if (password === "") {
      failWith(PASSWORD_REQUIRED_MESSAGE, null);
      return;
    }

    submitting.current = true;
    setPending(true);
    setFieldError(undefined);
    setFormError(null);
    try {
      const { error } = await authClient.deleteUser({ password });
      if (error) {
        const mapped = toDeleteAccountError({
          code: error.code,
          status: error.status,
        });
        const message = toDeleteAccountMessage(mapped);
        if (mapped.code === "password_required") failWith(message, null);
        else failWith(undefined, message);
        submitting.current = false;
        setPending(false);
        return;
      }
      // Keep the button pending: the page is about to go away.
      window.location.assign(ACCOUNT_DELETED_PATH);
    } catch {
      failWith(undefined, toDeleteAccountMessage({ code: "unexpected" }));
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      method="post"
      noValidate
      aria-busy={pending}
      className="flex max-w-md flex-col gap-5"
    >
      <PasswordField
        label="Your password"
        name="password"
        autoComplete="current-password"
        required
        error={fieldError}
      />
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
      <Button
        type="submit"
        variant="destructive"
        aria-disabled={pending}
        className="self-start"
      >
        {pending ? "Deleting…" : "Delete my account"}
      </Button>
    </form>
  );
}

"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Field } from "@/ui/field";
import { Button } from "@/ui/primitives/button";
import {
  RESEND_WAIT_SECONDS,
  type ResendState,
  useResendVerification,
} from "./use-resend-verification";
import { isPlausibleEmail } from "./validation";

/** The status line under a resend control. Announced by screen readers. */
function ResendStatus({ state }: { state: ResendState }) {
  return (
    <div role="status" aria-live="polite" className="min-h-6 text-sm">
      {state.kind === "sent"
        ? "If that email can be verified, we sent a new link."
        : null}
      {state.kind === "error" ? (
        <span className="text-destructive">{state.message}</span>
      ) : null}
    </div>
  );
}

function waitLabel(remaining: number): string {
  return `Send the link again in ${remaining}s`;
}

/**
 * A button that sends a fresh link to a known address (the "check your inbox"
 * panel, and the unverified sign in panel). It waits 60 seconds between sends.
 */
export function ResendVerificationButton({
  email,
  waitFirst = false,
}: {
  email: string;
  /** Start in the 60 second wait, because a link was only just sent. */
  waitFirst?: boolean;
}) {
  const { state, remaining, send, wait } = useResendVerification();
  const waiting = remaining > 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `wait` is stable; this runs once per mount
  useEffect(() => {
    if (waitFirst) wait(RESEND_WAIT_SECONDS);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={state.kind === "pending"}
        aria-disabled={waiting || undefined}
        onClick={() => void send(email)}
        className="self-start"
      >
        {waiting ? waitLabel(remaining) : "Send the link again"}
      </Button>
      <ResendStatus state={state} />
    </div>
  );
}

/**
 * The form on `/verify-email` for an expired or invalid link: the person types
 * their email and asks for a new link. The answer is the same for any address.
 */
export function ResendVerificationForm() {
  const { state, remaining, send } = useResendVerification();
  const [error, setError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  const waiting = remaining > 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(
      new FormData(event.currentTarget).get("email") ?? "",
    ).trim();
    if (!isPlausibleEmail(email)) {
      setError("Enter the email you signed up with.");
      inputRef.current?.focus();
      return;
    }
    setError(undefined);
    void send(email);
  }

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4"
    >
      <Field
        ref={inputRef}
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        error={error}
      />
      <Button
        type="submit"
        disabled={state.kind === "pending"}
        aria-disabled={waiting || undefined}
        className="self-start"
      >
        {waiting ? waitLabel(remaining) : "Send a new link"}
      </Button>
      <ResendStatus state={state} />
    </form>
  );
}

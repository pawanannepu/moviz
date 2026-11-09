"use client";

import { useRef, useState } from "react";
import { toAuthError, toAuthMessage } from "@/auth/auth-errors";
import { authClient } from "@/auth/client";
import { VERIFY_EMAIL_PATH } from "@/auth/paths";
import { readRetryAfter } from "./retry-after";
import { useCooldown } from "./use-cooldown";

/** How long the resend button waits between sends (spec 0005, AC-3). */
export const RESEND_WAIT_SECONDS = 60;

export type ResendState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

/**
 * Asks for a fresh verification link. A user who does not exist and one who is
 * already verified get the same "sent" answer as everyone else, so this never
 * says whether an address has an account. The button waits 60 seconds after
 * every try.
 */
export function useResendVerification() {
  const [state, setState] = useState<ResendState>({ kind: "idle" });
  const { remaining, start } = useCooldown();
  const busy = useRef(false);

  async function send(email: string): Promise<void> {
    if (busy.current || remaining > 0) return;
    busy.current = true;
    setState({ kind: "pending" });
    let retryAfterSeconds: number | undefined;
    try {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: VERIFY_EMAIL_PATH,
        fetchOptions: {
          onError: (context) => {
            retryAfterSeconds = readRetryAfter(context.response);
          },
        },
      });
      const mapped = error
        ? toAuthError({
            code: error.code,
            status: error.status,
            retryAfterSeconds,
          })
        : null;
      if (mapped?.code === "rate_limited") {
        start(mapped.seconds);
        setState({ kind: "error", message: toAuthMessage(mapped) });
      } else if (
        mapped &&
        error?.code !== "USER_NOT_FOUND" &&
        error?.code !== "INVALID_USER"
      ) {
        start(RESEND_WAIT_SECONDS);
        setState({ kind: "error", message: toAuthMessage(mapped) });
      } else {
        start(RESEND_WAIT_SECONDS);
        setState({ kind: "sent" });
      }
    } catch {
      setState({
        kind: "error",
        message: toAuthMessage({ code: "unexpected" }),
      });
    } finally {
      busy.current = false;
    }
  }

  return { state, remaining, send, wait: start };
}

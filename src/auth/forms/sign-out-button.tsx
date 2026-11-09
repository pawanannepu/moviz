"use client";

import { useRef, useState } from "react";
import { toAuthMessage } from "@/auth/auth-errors";
import { authClient } from "@/auth/client";
import { SIGNED_OUT_PATH } from "@/auth/paths";
import { Button } from "@/ui/primitives/button";

/**
 * Signs out: deletes the session on the server and clears the cookie, then
 * moves the browser to `/` with a full page navigation so no stale page is
 * cached (spec 0005, AC-5).
 */
export function SignOutButton() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signOut() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage(null);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setMessage(toAuthMessage({ code: "unexpected" }));
        return;
      }
      window.location.assign(SIGNED_OUT_PATH);
    } catch {
      setMessage(toAuthMessage({ code: "unexpected" }));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => void signOut()}
        className="self-start"
      >
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      <div role="alert" className="text-destructive text-sm">
        {message}
      </div>
    </div>
  );
}

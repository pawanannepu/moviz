"use client";

import { useEffect } from "react";
import { authClient } from "@/auth/client";

/**
 * Renews the session cookie (spec 0005, AC-4). A Server Component can extend
 * the session row in the database but cannot write the cookie, so this asks
 * Better Auth's own `get-session` route once per full page load; that response
 * carries the refreshed cookie. Renders nothing. Failure is ignored: the page
 * has already checked the session on the server.
 */
export function RenewSession() {
  useEffect(() => {
    void authClient.getSession().catch(() => undefined);
  }, []);
  return null;
}

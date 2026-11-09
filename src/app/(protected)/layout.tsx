import type { ReactNode } from "react";
import { RenewSession } from "@/auth/renew-session";

/**
 * Pages that hold personal data. The layout only renews the cookie; it cannot
 * guard the pages, because layouts do not re-run on client navigation. Each
 * page calls `requireUser` itself (spec 0005, AC-8).
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RenewSession />
      {children}
    </>
  );
}

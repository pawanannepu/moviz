import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/ui/site-header";

// Account pages are not search targets.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const AUTH_LINKS = [{ href: "/", label: "Home" }] as const;

/** Sign up, sign in, verify and reset pages share the header and stay out of search. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader links={AUTH_LINKS} />
      {children}
    </>
  );
}

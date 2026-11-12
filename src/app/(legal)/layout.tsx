import type { ReactNode } from "react";
import { SiteHeader } from "@/ui/site-header";

const LEGAL_LINKS = [{ href: "/", label: "Home" }] as const;

/** The privacy policy and the terms share the site header (spec 0014). */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader links={LEGAL_LINKS} />
      {children}
    </>
  );
}

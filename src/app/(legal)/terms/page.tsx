import type { Metadata } from "next";
import { LegalDocument } from "@/legal/legal-document";
import { TERMS_LEAD, TERMS_SECTIONS, TERMS_TITLE } from "@/legal/terms-of-use";

export const metadata: Metadata = { title: `${TERMS_TITLE} · Moviz` };

/** The terms of use. Public and static (spec 0014, AC-1, AC-3). */
export default function TermsPage() {
  return (
    <LegalDocument
      title={TERMS_TITLE}
      lead={TERMS_LEAD}
      sections={TERMS_SECTIONS}
    />
  );
}

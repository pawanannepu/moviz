import type { Metadata } from "next";
import { LegalDocument } from "@/legal/legal-document";
import {
  PRIVACY_LEAD,
  PRIVACY_SECTIONS,
  PRIVACY_TITLE,
} from "@/legal/privacy-policy";

export const metadata: Metadata = { title: `${PRIVACY_TITLE} · Moviz` };

/** The privacy policy. Public and static (spec 0014, AC-1, AC-2). */
export default function PrivacyPage() {
  return (
    <LegalDocument
      title={PRIVACY_TITLE}
      lead={PRIVACY_LEAD}
      sections={PRIVACY_SECTIONS}
    />
  );
}

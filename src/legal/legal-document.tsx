import type { ReactNode } from "react";
import {
  CONTACT_EMAIL,
  formatLegalDate,
  LEGAL_PLACEHOLDER_TEXT,
  LEGAL_UPDATED_ON,
  missingLegalDetails,
} from "./operator";

/** One headed section of a legal page. */
export type LegalSection = {
  /** The anchor id, used by the "On this page" list. */
  id: string;
  title: string;
  body: ReactNode;
};

/**
 * Shows a legal detail, or the placeholder text when it is not filled yet
 * (spec 0014, AC-12).
 */
export function LegalDetail({ name, value }: { name: string; value: string }) {
  const unfilled = missingLegalDetails().includes(name);
  return <>{unfilled ? LEGAL_PLACEHOLDER_TEXT : value}</>;
}

/** A bulleted list in the legal pages' style. */
export function Bullets({ children }: { children: ReactNode }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-6 marker:text-muted-foreground">
      {children}
    </ul>
  );
}

/** The contact email as a mail link, or the placeholder text. */
export function ContactEmail() {
  if (missingLegalDetails().includes("CONTACT_EMAIL")) {
    return <>{LEGAL_PLACEHOLDER_TEXT}</>;
  }
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline">
      {CONTACT_EMAIL}
    </a>
  );
}

/**
 * The frame for the privacy policy and the terms: one `h1`, the "Last
 * updated" date, a short lead, an "On this page" list, then each section
 * under its own `h2`, in order (spec 0014, AC-1). Static, a Server Component.
 */
export function LegalDocument({
  title,
  lead,
  sections,
}: {
  title: string;
  lead: ReactNode;
  sections: readonly LegalSection[];
}) {
  return (
    <div className="page-container py-8 sm:py-12">
      <header className="flex max-w-[68ch] flex-col gap-3 border-card border-b pb-8">
        <p className="type-small">
          Last updated{" "}
          <time dateTime={LEGAL_UPDATED_ON}>
            {formatLegalDate(LEGAL_UPDATED_ON)}
          </time>
        </p>
        <h1 className="type-headline">{title}</h1>
        <div className="text-lg text-muted-foreground">{lead}</div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[15rem_minmax(0,68ch)] lg:gap-16">
        <nav
          aria-label="On this page"
          className="lg:sticky lg:top-6 lg:self-start"
        >
          <p className="type-title">On this page</p>
          <ol className="mt-3 flex flex-col gap-1 border-card border-l">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="-ml-px inline-flex min-h-11 items-center border-transparent border-l-2 pl-4 text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="flex flex-col gap-10">
          {sections.map((section) => (
            <section
              key={section.id}
              aria-labelledby={`${section.id}-heading`}
              className="flex scroll-mt-6 flex-col gap-4"
              id={section.id}
            >
              <h2 id={`${section.id}-heading`} className="type-section">
                {section.title}
              </h2>
              {section.body}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}

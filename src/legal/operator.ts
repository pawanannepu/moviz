/**
 * The legal details the privacy policy and the terms show (spec 0014, AC-12).
 *
 * Fill the three placeholders below before the first production deploy. A
 * production build on Vercel fails until they are filled (`next.config.ts`
 * calls `assertLegalDetailsForBuild`). This file has no imports on purpose:
 * `next.config.ts` loads it by relative path, where the `@/` alias does not
 * work.
 */

/** Who runs Moviz, as it should read in the policy. Placeholder until filled. */
export const OPERATOR_NAME: string = "OPERATOR_NAME";

/** Where people write about their data or the terms. Placeholder until filled. */
export const CONTACT_EMAIL: string = "CONTACT_EMAIL";

/**
 * How many days deleted data can survive in database backups: the point in
 * time restore window of the Neon plan (Neon console). `null` until filled.
 */
export const BACKUP_RETENTION_DAYS: number | null = null;

/**
 * The date the policy and terms last changed, `YYYY-MM-DD`. It is also the
 * terms version a new profile records (`src/auth/terms.ts`), so change it
 * whenever the text changes.
 */
export const LEGAL_UPDATED_ON = "2026-11-12";

/** What the pages show in place of a detail that is not filled yet. */
export const LEGAL_PLACEHOLDER_TEXT = "[to be filled before launch]";

/** The three details, as one value, so the checks below can take a stand in. */
export type LegalDetails = {
  OPERATOR_NAME: string;
  CONTACT_EMAIL: string;
  BACKUP_RETENTION_DAYS: number | null;
};

const CURRENT_DETAILS: LegalDetails = {
  OPERATOR_NAME,
  CONTACT_EMAIL,
  BACKUP_RETENTION_DAYS,
};

/** True when a text detail is still empty or still holds its own name. */
function isUnfilledText(value: string, name: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || trimmed === name;
}

/**
 * The names of the legal details still unfilled, in a fixed order. Pure. An
 * empty list means the site may launch.
 */
export function missingLegalDetails(
  details: LegalDetails = CURRENT_DETAILS,
): string[] {
  const missing: string[] = [];
  if (isUnfilledText(details.OPERATOR_NAME, "OPERATOR_NAME")) {
    missing.push("OPERATOR_NAME");
  }
  if (isUnfilledText(details.CONTACT_EMAIL, "CONTACT_EMAIL")) {
    missing.push("CONTACT_EMAIL");
  }
  const days = details.BACKUP_RETENTION_DAYS;
  if (days === null || !Number.isInteger(days) || days < 0) {
    missing.push("BACKUP_RETENTION_DAYS");
  }
  return missing;
}

/** The build environment values the launch check reads. */
export type LegalBuildEnv = {
  VERCEL?: string | undefined;
  VERCEL_ENV?: string | undefined;
};

/**
 * Throws when this is a production build on Vercel and a legal detail is
 * still a placeholder, naming each missing one. Local, CI and preview builds
 * pass. Pure apart from the throw.
 */
export function assertLegalDetailsForBuild(
  env: LegalBuildEnv,
  details: LegalDetails = CURRENT_DETAILS,
): void {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "production") return;
  const missing = missingLegalDetails(details);
  if (missing.length === 0) return;
  throw new Error(
    `Fill these legal details in src/legal/operator.ts before a production deploy: ${missing.join(", ")}.`,
  );
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Formats a `YYYY-MM-DD` date as "12 November 2026". Pure, and free of time
 * zones, so the server and the browser always agree.
 */
export function formatLegalDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || !month) return isoDate;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

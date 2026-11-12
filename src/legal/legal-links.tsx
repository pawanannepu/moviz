import Link from "next/link";
import { PRIVACY_PATH, TERMS_PATH } from "./paths";

/**
 * The "Privacy" and "Terms" links in the site footer (spec 0014, AC-4). A
 * `nav` inside the one footer, so the page keeps a single footer landmark.
 */
export function LegalLinks() {
  return (
    <nav aria-label="Legal">
      <ul className="flex flex-wrap gap-x-6">
        <li>
          <Link
            href={PRIVACY_PATH}
            className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Privacy
          </Link>
        </li>
        <li>
          <Link
            href={TERMS_PATH}
            className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Terms
          </Link>
        </li>
      </ul>
    </nav>
  );
}

import Link from "next/link";
import { type NavLink, NavLinks } from "@/ui/nav-links";

/**
 * The top bar: the Moviz wordmark as a link home, then the navigation list.
 * One bar at every width. Route group layouts render it; `/` does not, because
 * the landing page shows the wordmark at hero size.
 */
export function SiteHeader({ links }: { links: readonly NavLink[] }) {
  return (
    <header className="page-container flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2">
      <Link href="/" className="type-brand inline-flex min-h-11 items-center">
        Moviz
      </Link>
      <NavLinks links={links} />
    </header>
  );
}

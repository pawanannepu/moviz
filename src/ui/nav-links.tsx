"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/ui/cn";

export type NavLink = { href: string; label: string };

/**
 * The navigation list. A small client component only because it reads the
 * current path, so it can mark the current page with `aria-current="page"`.
 */
export function NavLinks({ links }: { links: readonly NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main">
      <ul className="flex flex-wrap items-center gap-x-6">
        {links.map((link) => {
          const current = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "state-change inline-flex min-h-11 items-center underline-offset-8 hover:text-foreground",
                  current
                    ? "text-foreground underline decoration-primary decoration-2"
                    : "text-muted-foreground",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

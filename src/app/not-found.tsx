import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/ui/primitives/button";

export const metadata: Metadata = {
  title: "Page not found · Moviz",
  robots: { index: false, follow: false },
};

/**
 * The site wide not found page (feature 18, the accessibility pass). Without
 * it Next shows its built in page, which ignores the design system and puts
 * the footer on a light background that fails contrast. It sits inside the
 * root layout's `main`, so it keeps the skip link and the footer. The route
 * guard sends signed out visitors to sign in first, so the way back is the feed.
 */
export default function NotFound() {
  return (
    <>
      <header className="page-container flex items-center py-2">
        <Link href="/" className="type-brand inline-flex min-h-11 items-center">
          Moviz
        </Link>
      </header>
      <div className="page-container flex flex-col gap-6 py-6">
        <section
          data-slot="page-not-found"
          className="flex flex-col items-start gap-4 rounded-sheet bg-card p-8"
        >
          <h1 className="type-section">Page not found</h1>
          <p className="max-w-[62ch] text-muted-foreground">
            This address does not lead anywhere in Moviz. It may have a typo, or
            the page may have moved.
          </p>
          <Button asChild>
            <Link href="/home">Back to your picks</Link>
          </Button>
        </section>
      </div>
    </>
  );
}

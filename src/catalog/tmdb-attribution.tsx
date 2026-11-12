import Image from "next/image";
import { LegalLinks } from "@/legal/legal-links";

/** The notice TMDB requires beside its logo (spec 0003, AC-14). */
export const TMDB_NOTICE =
  "This product uses the TMDB API but is not endorsed or certified by TMDB.";

/**
 * Site footer with the TMDB logo and the required notice (spec 0003, AC-14).
 * Rendered once by the root layout, so every page shows it. The Moviz name is
 * set larger than the logo, which TMDB's rules ask for. The logo is an SVG
 * served as is, so it needs no image optimization. Styled with the Moviz
 * tokens (spec 0004). The legal links sit above the notice, inside this one
 * footer (spec 0014, AC-4).
 */
export function TmdbAttribution() {
  return (
    <footer className="mt-16 border-t border-card py-8">
      <div className="page-container flex flex-col items-start gap-3">
        <p className="type-brand">Moviz</p>
        <LegalLinks />
        <Image
          src="/tmdb-logo.svg"
          alt="TMDB"
          width={92}
          height={12}
          unoptimized
        />
        <p className="type-small max-w-[62ch]">{TMDB_NOTICE}</p>
      </div>
    </footer>
  );
}

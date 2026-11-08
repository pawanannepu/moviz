import Image from "next/image";

/** The notice TMDB requires beside its logo (spec 0003, AC-14). */
export const TMDB_NOTICE =
  "This product uses the TMDB API but is not endorsed or certified by TMDB.";

/**
 * Site footer with the TMDB logo and the required notice (spec 0003, AC-14).
 * Rendered by the root layout, so every page shows it. The Moviz name is set
 * larger than the logo, which TMDB's rules ask for. The logo is an SVG served
 * as is, so it needs no image optimization.
 */
export function TmdbAttribution() {
  return (
    <footer className="flex flex-col items-center gap-3 border-t border-zinc-200 px-6 py-6 text-center dark:border-zinc-800">
      <p className="text-xl font-semibold tracking-tight">Moviz</p>
      <Image
        src="/tmdb-logo.svg"
        alt="TMDB"
        width={92}
        height={12}
        unoptimized
      />
      <p className="max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
        {TMDB_NOTICE}
      </p>
    </footer>
  );
}

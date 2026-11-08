import type { Metadata, Viewport } from "next";
import { Archivo, Atkinson_Hyperlegible_Next } from "next/font/google";
import { TmdbAttribution } from "@/catalog/tmdb-attribution";
import { Toaster } from "@/ui/primitives/sonner";
import { SkipLink } from "@/ui/skip-link";
import "./globals.css";

// Archivo (with its width axis) carries the wordmark and headlines.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

// Atkinson Hyperlegible Next carries everything else.
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Moviz",
  description: "Movie recommendations that tell you why each pick was chosen.",
};

// Dark only (spec 0004): the browser chrome matches the Pit background.
export const viewport: Viewport = {
  themeColor: "#170b10",
  colorScheme: "dark",
};

/**
 * The root layout renders the skip link, `main`, the toaster and the TMDB
 * footer once for every page (spec 0004, AC-7). Route group layouts add a
 * `SiteHeader` inside it when they want one.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${atkinson.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SkipLink />
        <main id="main-content" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <Toaster />
        <TmdbAttribution />
      </body>
    </html>
  );
}

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TMDB_NOTICE, TmdbAttribution } from "./tmdb-attribution";

describe("TmdbAttribution (AC-14)", () => {
  const html = renderToStaticMarkup(<TmdbAttribution />);

  it("shows the required notice word for word", () => {
    expect(TMDB_NOTICE).toBe(
      "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    );
    expect(html).toContain(TMDB_NOTICE);
  });

  it("shows the TMDB logo with the alt text TMDB", () => {
    expect(html).toMatch(/<img[^>]*alt="TMDB"/);
    expect(html).toContain("/tmdb-logo.svg");
  });

  it("shows the Moviz name", () => {
    expect(html).toContain(">Moviz<");
  });

  it("is a footer landmark", () => {
    expect(html.startsWith("<footer")).toBe(true);
  });

  it("sets the logo smaller than the Moviz name", () => {
    // The name is set in the brand style (1.5rem, 24px). The logo is 12px high.
    const height = Number(/height="(\d+)"/.exec(html)?.[1]);

    expect(height).toBeLessThan(24);
    expect(html).toContain("type-brand");
  });
});

// Spec 0014, AC-4: the legal links live inside this one footer, above the notice.
describe("TmdbAttribution legal links (spec 0014, AC-4)", () => {
  const html = renderToStaticMarkup(<TmdbAttribution />);

  it("has a Legal nav with Privacy and Terms links", () => {
    expect(html).toMatch(/<nav aria-label="Legal">/);
    expect(html).toMatch(/<a[^>]*href="\/privacy"[^>]*>Privacy<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/terms"[^>]*>Terms<\/a>/);
  });

  it("keeps a single footer landmark", () => {
    expect(html.match(/<footer/g)).toHaveLength(1);
    expect(html.indexOf("<nav")).toBeLessThan(html.indexOf("</footer>"));
  });

  it("puts the links above the TMDB notice", () => {
    expect(html.indexOf('aria-label="Legal"')).toBeLessThan(
      html.indexOf(TMDB_NOTICE),
    );
  });
});

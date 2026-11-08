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

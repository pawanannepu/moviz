import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout, { viewport } from "./layout";

// next/font only works inside the Next compiler, so stand in for it here.
vi.mock("next/font/google", () => ({
  Archivo: () => ({ variable: "archivo-var" }),
  Atkinson_Hyperlegible_Next: () => ({ variable: "atkinson-var" }),
}));

const count = (html: string, pattern: RegExp) =>
  html.match(pattern)?.length ?? 0;

describe("root layout (AC-7)", () => {
  const html = renderToStaticMarkup(
    RootLayout({ children: <p>Page content</p> } as Parameters<
      typeof RootLayout
    >[0]),
  );

  it("renders exactly one skip link, one main and one footer", () => {
    expect(count(html, /<a [^>]*href="#main-content"/g)).toBe(1);
    expect(count(html, /<main[\s>]/g)).toBe(1);
    expect(count(html, /<footer[\s>]/g)).toBe(1);
  });

  it("puts the skip link before the main content", () => {
    expect(html.indexOf("Skip to content")).toBeLessThan(html.indexOf("<main"));
  });

  it("makes main the skip link target and focusable by script", () => {
    expect(html).toMatch(/<main[^>]*id="main-content"[^>]*tabindex="-1"/i);
  });

  it("renders the page inside main, with the footer after it", () => {
    expect(html.indexOf("Page content")).toBeGreaterThan(html.indexOf("<main"));
    expect(html.indexOf("<footer")).toBeGreaterThan(
      html.indexOf("Page content"),
    );
  });

  it("is dark only (AC-1)", () => {
    expect(viewport.colorScheme).toBe("dark");
  });
});

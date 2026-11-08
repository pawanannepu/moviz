import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

describe("design tokens in globals.css (AC-1)", () => {
  it.each([
    ["pit", "#170b10"],
    ["curtain", "#26121a"],
    ["screen", "#efe9df"],
    ["dust", "#b8a5ac"],
    ["subtitle", "#f5d547"],
    ["exit", "#ff7a6b"],
    ["edge", "#8f7480"],
  ])("defines --color-%s as %s", (name, hex) => {
    expect(css.toLowerCase()).toContain(`--color-${name}: ${hex};`);
  });

  it.each([
    "--radius-poster: 2px",
    "--radius-control: 6px",
    "--radius-sheet: 10px",
    "--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)",
    "--dur-state: 120ms",
    "--dur-reveal: 240ms",
    "--dur-card: 220ms",
  ])("defines %s", (declaration) => {
    expect(css).toContain(declaration);
  });

  it.each([
    "--surface-hover",
    "--primary-hover",
    "--primary-pressed",
    "--bar-bg",
    "--glow-drag",
  ])("defines the derived token %s", (name) => {
    expect(css).toContain(`${name}:`);
  });

  it.each([
    ["background", "pit"],
    ["foreground", "screen"],
    ["card", "curtain"],
    ["card-foreground", "screen"],
    ["popover", "curtain"],
    ["primary", "subtitle"],
    ["primary-foreground", "pit"],
    ["secondary", "curtain"],
    ["secondary-foreground", "screen"],
    ["muted", "curtain"],
    ["muted-foreground", "dust"],
    ["accent", "curtain"],
    ["accent-foreground", "screen"],
    ["destructive", "exit"],
    ["border", "edge"],
    ["input", "edge"],
    ["ring", "screen"],
  ])("maps the shadcn variable %s to %s", (name, color) => {
    expect(css).toContain(`--color-${name}: var(--color-${color});`);
  });

  it("is dark only", () => {
    expect(css).toContain("color-scheme: dark");
    expect(css).not.toMatch(/@media\s*\(\s*prefers-color-scheme/);
  });

  it("has no leftover Geist font or Arial fallback from the scaffold", () => {
    expect(css).not.toMatch(/geist/i);
    expect(css).not.toMatch(/arial/i);
  });

  it("draws one global focus ring: 3px Screen, 3px offset", () => {
    expect(css).toMatch(
      /:focus-visible\s*{\s*outline:\s*3px solid var\(--color-screen\);\s*outline-offset:\s*3px;/,
    );
  });
});

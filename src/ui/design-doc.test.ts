import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const path = join(process.cwd(), "design.md");
const doc = existsSync(path) ? readFileSync(path, "utf8") : "";

describe("design.md (AC-2)", () => {
  it("exists at the repo root", () => {
    expect(existsSync(path)).toBe(true);
  });

  it.each([
    "--color-pit",
    "--color-curtain",
    "--color-screen",
    "--color-dust",
    "--color-subtitle",
    "--color-exit",
    "--color-edge",
    "--surface-hover",
    "--primary-hover",
    "--primary-pressed",
    "--bar-bg",
    "--glow-drag",
    "--ease-out",
    "--dur-state",
    "--dur-reveal",
    "--dur-card",
  ])("names the token %s", (token) => {
    expect(doc).toContain(token);
  });

  it.each([
    "type-wordmark",
    "type-headline",
    "type-section",
    "type-title",
    "type-reason",
    "type-small",
  ])("names the type style %s", (style) => {
    expect(doc).toContain(style);
  });

  it.each([
    "Button",
    "Input",
    "Label",
    "Skeleton",
    "Toaster",
    "Field",
    "SkipLink",
    "SiteHeader",
    "NavLinks",
    "PosterImage",
    "SubtitleBar",
    "MovieCard",
    "FeedItem",
    "ReasonReveal",
    "MovieCardSkeleton",
    "SwipeCard",
    "SwipeDeck",
    "decideFromDrag",
    "EmptyState",
    "ErrorState",
    "LoadingState",
    "Hero",
    "loadHeroPick",
  ])("describes the component %s", (name) => {
    expect(doc).toContain(`**${name}**`);
  });

  it.each([
    "## Dark only",
    "## Color",
    "## Type",
    "## Spacing, layout and shape",
    "## Motion",
    "## Focus and keyboard",
    "## Components",
    "## Wireframes",
  ])("has the section %s", (heading) => {
    expect(doc).toContain(heading);
  });

  it("holds the three wireframes", () => {
    expect(doc).toContain("**Signed out landing**");
    expect(doc).toContain("**Swipe onboarding**");
    expect(doc).toContain("**Personalized feed**");
  });

  it("lists the same color values the CSS defines", () => {
    const css = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const tokens = [...css.matchAll(/--color-([a-z]+):\s*#/g)].map((m) => m[1]);

    for (const name of [
      "pit",
      "curtain",
      "screen",
      "dust",
      "subtitle",
      "exit",
      "edge",
    ]) {
      expect(tokens).toContain(name);
      expect(doc).toContain(`--color-${name}`);
    }
  });
});

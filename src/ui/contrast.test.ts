import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  mixOklab,
  overlay,
  parseHex,
  type Rgb,
  readColorTokens,
} from "./contrast";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const tokens = readColorTokens(css);

function token(name: string): Rgb {
  const value = tokens[name];
  if (!value) throw new Error(`Missing color token --color-${name}`);
  return value;
}

const pit = token("pit");
const curtain = token("curtain");
const screen = token("screen");
const dust = token("dust");
const subtitle = token("subtitle");
const exit = token("exit");
const edge = token("edge");

// --surface-hover: color-mix(in oklab, Screen 8%, Curtain)
const hover = mixOklab(screen, 8, curtain);
// --bar-bg: Pit at 88% over the poster pixel
const BAR_ALPHA = 0.88;
const white: Rgb = [255, 255, 255];
const black: Rgb = [0, 0, 0];

const TEXT = 4.5;
const LARGE_OR_BORDER = 3;

describe("color tokens", () => {
  it("reads every palette color from globals.css (AC-3)", () => {
    expect(Object.keys(tokens)).toEqual(
      expect.arrayContaining([
        "pit",
        "curtain",
        "screen",
        "dust",
        "subtitle",
        "exit",
        "edge",
      ]),
    );
  });
});

describe("contrast guard (AC-3)", () => {
  const textPairs: [string, Rgb, string, Rgb][] = [
    ["Screen", screen, "Pit", pit],
    ["Screen", screen, "Curtain", curtain],
    ["Dust", dust, "Pit", pit],
    ["Dust", dust, "Curtain", curtain],
    ["Subtitle", subtitle, "Pit", pit],
    ["Subtitle", subtitle, "Curtain", curtain],
    ["Exit", exit, "Pit", pit],
    ["Exit", exit, "Curtain", curtain],
    ["Pit", pit, "Subtitle (primary button)", subtitle],
    ["Dust", dust, "the hover surface", hover],
    ["Screen", screen, "the hover surface", hover],
  ];

  it.each(textPairs)("%s text on %s is at least 4.5:1", (_a, fg, _b, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(TEXT);
  });

  const borderPairs: [string, Rgb][] = [
    ["Pit", pit],
    ["Curtain", curtain],
    ["the hover surface", hover],
  ];

  it.each(borderPairs)("Edge on %s is at least 3:1", (_name, bg) => {
    expect(contrastRatio(edge, bg)).toBeGreaterThanOrEqual(LARGE_OR_BORDER);
  });

  it("keeps Subtitle readable on the subtitle bar over a pure white poster (AC-9)", () => {
    const bar = overlay(pit, BAR_ALPHA, white);

    expect(contrastRatio(subtitle, bar)).toBeGreaterThanOrEqual(TEXT);
  });

  it("keeps Subtitle readable on the subtitle bar over a pure black poster (AC-9)", () => {
    const bar = overlay(pit, BAR_ALPHA, black);

    expect(contrastRatio(subtitle, bar)).toBeGreaterThanOrEqual(TEXT);
  });

  it("fails when Dust is darkened too far", () => {
    const tooDark = parseHex("#5a4a50");

    expect(contrastRatio(tooDark, curtain)).toBeLessThan(TEXT);
  });
});

describe("color math", () => {
  it("measures black on white as 21:1", () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
  });

  it("mixes nothing when the share is 0", () => {
    expect(mixOklab(screen, 0, curtain)).toEqual(curtain);
  });

  it("rejects a hex color that is not six digits", () => {
    expect(() => parseHex("#fff")).toThrow();
  });
});

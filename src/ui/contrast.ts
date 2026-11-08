/**
 * Color math for the contrast guard (spec 0004, AC-3). Pure functions: parse a
 * hex color, mix colors the way CSS `color-mix` does, and measure the WCAG
 * contrast ratio. Used by tests only, so a token edit that breaks a pair fails.
 */

export type Rgb = readonly [number, number, number];

/** Reads `#rrggbb` into 0 to 255 channels. */
export function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Not a six digit hex color: ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Reads every `--color-name: #hex;` declaration from a CSS file. Returns a map
 * from the name (`pit`) to its channels.
 */
export function readColorTokens(css: string): Record<string, Rgb> {
  const tokens: Record<string, Rgb> = {};
  for (const match of css.matchAll(
    /--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g,
  )) {
    tokens[match[1]] = parseHex(match[2]);
  }
  return tokens;
}

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(linear: number): number {
  const c =
    linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two colors, from 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

type Oklab = readonly [number, number, number];

function toOklab([r, g, b]: Rgb): Oklab {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: Oklab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * `color-mix(in oklab, top <percent>%, bottom)`: the share `percent` (0 to 100)
 * of `top` mixed into `bottom`.
 */
export function mixOklab(top: Rgb, percent: number, bottom: Rgb): Rgb {
  const t = percent / 100;
  const a = toOklab(top);
  const b = toOklab(bottom);
  return fromOklab([
    a[0] * t + b[0] * (1 - t),
    a[1] * t + b[1] * (1 - t),
    a[2] * t + b[2] * (1 - t),
  ]);
}

/**
 * A color drawn at `alpha` (0 to 1) over a backdrop, in sRGB. This is how the
 * browser paints `color-mix(in srgb, color 88%, transparent)` over a poster.
 */
export function overlay(top: Rgb, alpha: number, backdrop: Rgb): Rgb {
  return [
    Math.round(top[0] * alpha + backdrop[0] * (1 - alpha)),
    Math.round(top[1] * alpha + backdrop[1] * (1 - alpha)),
    Math.round(top[2] * alpha + backdrop[2] * (1 - alpha)),
  ];
}

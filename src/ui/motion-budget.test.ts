import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Motion is limited to three named moments plus 120ms state changes, and all of
 * it lives in `src/app/globals.css`, where the duration tokens are (spec 0004,
 * AC-19). Components in `src/ui` only name a class. This test fails when one of
 * them starts its own animation. Sonner's file is exempt: its animations are
 * left as shipped.
 */
const MOTION_WORDS = /@keyframes|animate-|transition|duration/;
const EXEMPT = new Set(["primitives/sonner.tsx"]);

/** The lines of `source` that use a motion word. */
function findMotionViolations(source: string): string[] {
  return source.split("\n").filter((line) => MOTION_WORDS.test(line));
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [path]
      : [];
  });
}

describe("motion budget (AC-19)", () => {
  const root = join(process.cwd(), "src/ui");
  const files = sourceFiles(root).filter(
    (file) => !EXEMPT.has(relative(root, file)),
  );

  it("checks the real component files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => [relative(root, file), file]))(
    "%s starts no animation of its own",
    (_name, file) => {
      expect(findMotionViolations(readFileSync(file, "utf8"))).toEqual([]);
    },
  );

  it("would catch each kind of motion", () => {
    expect(findMotionViolations("@keyframes spin {}")).toHaveLength(1);
    expect(findMotionViolations('className="animate-pulse"')).toHaveLength(1);
    expect(findMotionViolations('className="transition-all"')).toHaveLength(1);
    expect(findMotionViolations('className="duration-300"')).toHaveLength(1);
    expect(findMotionViolations('className="state-change"')).toHaveLength(0);
  });

  it("keeps Sonner's own animations out of the check on purpose", () => {
    const sonner = readFileSync(join(root, "primitives/sonner.tsx"), "utf8");

    expect(findMotionViolations(sonner).length).toBeGreaterThan(0);
  });
});

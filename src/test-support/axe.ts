import axe from "axe-core";

/**
 * Runs the WCAG A and AA rules against `root` and returns one line per
 * violation (an empty list means clean). For component tests in a DOM
 * environment such as happy-dom. Colour contrast is switched off, because a
 * DOM without layout or real styles cannot measure it: `src/ui/contrast.test.ts`
 * and the Playwright scans own contrast.
 */
export async function axeViolations(root: Element): Promise<string[]> {
  const results = await axe.run(root, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: { "color-contrast": { enabled: false } },
  });
  return results.violations.map(
    (violation) => `${violation.id}: ${violation.help}`,
  );
}

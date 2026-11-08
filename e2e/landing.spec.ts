import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Spec 0004: the signed out landing page.

const WIDTHS = [320, 360, 768, 1280] as const;

type LayoutShiftEntry = PerformanceEntry & {
  value: number;
  hadRecentInput: boolean;
};

test.describe("landing page", () => {
  test("shows the wordmark, headline, line, both buttons and a poster with the sample reason in the first viewport (AC-15)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    const main = page.getByRole("main");

    await expect(main.getByText("Moviz", { exact: true })).toBeInViewport();
    await expect(
      page.getByRole("heading", { level: 1, name: "Picks that say why." }),
    ).toBeInViewport();
    await expect(
      page.getByText(/^Swipe a few movies you know/),
    ).toBeInViewport();
    await expect(
      page.getByRole("link", { name: "Start swiping" }),
    ).toBeInViewport();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeInViewport();
    await expect(page.locator("figure")).toBeInViewport({ ratio: 0.1 });
    // Hidden text that tells a screen reader the reason is an example.
    await expect(page.getByText("Example pick:")).toBeAttached();
    await expect(page.locator('[data-slot="subtitle-bar"]')).toContainText(
      /^Example pick: Because you rated/,
    );
  });

  test("has a header-free first screen with no stats, badges or card grid (AC-15)", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(page.locator("main article")).toHaveCount(0);
    await expect(page.locator("main ul")).toHaveCount(0);
  });

  test("marks the poster as the most important image when there is one (AC-15)", async ({
    page,
  }) => {
    await page.goto("/");
    const poster = page.getByRole("img", { name: /^Poster for / });

    // With an empty catalog there is only the empty frame, which is also fine.
    if ((await poster.count()) > 0) {
      await expect(poster).toHaveAttribute("fetchpriority", "high");
    }
  });

  test("sets the wordmark and headline in Archivo and the rest in Atkinson (AC-4)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const family = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).fontFamily);

    expect(await family("main p.type-wordmark")).toContain("Archivo");
    expect(await family("main h1")).toContain("Archivo");
    expect(await family("main p.text-lg")).toContain(
      "Atkinson Hyperlegible Next",
    );
  });

  test("has a layout shift score of 0 (AC-4)", async ({ page }) => {
    await page.addInitScript(() => {
      const holder = window as unknown as { __cls: number };
      holder.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as LayoutShiftEntry[]) {
          if (!entry.hadRecentInput) holder.__cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/", { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);

    const score = await page.evaluate(
      () => (window as unknown as { __cls: number }).__cls,
    );

    expect(score).toBe(0);
  });

  test("stacks wordmark, headline, line, buttons and poster under 1024px (AC-16)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/");
    const main = page.getByRole("main");
    const tops = await Promise.all(
      [
        main.getByText("Moviz", { exact: true }),
        page.getByRole("heading", { level: 1 }),
        page.getByText(/^Swipe a few movies you know/),
        page.getByRole("link", { name: "Start swiping" }),
        page.locator("figure"),
      ].map(async (locator) => (await locator.boundingBox())?.y ?? Number.NaN),
    );

    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(new Set(tops).size).toBe(tops.length);
  });

  test("puts the text column left of the poster from 1024px, in the same page order (AC-16)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const text = await page.getByRole("heading", { level: 1 }).boundingBox();
    const poster = await page.locator("figure").boundingBox();

    expect(text).not.toBeNull();
    expect(poster).not.toBeNull();
    expect((text?.x ?? 0) + (text?.width ?? 0)).toBeLessThanOrEqual(
      poster?.x ?? 0,
    );
    // The poster comes after the buttons in the document, so a screen reader hears the same order.
    const order = await page.evaluate(() => {
      const heading = document.querySelector("h1");
      const figure = document.querySelector("figure");
      return Boolean(
        heading &&
          figure &&
          heading.compareDocumentPosition(figure) &
            Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    expect(order).toBe(true);
  });

  for (const width of WIDTHS) {
    test(`does not scroll sideways at ${width}px wide (AC-16)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );

      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("makes the skip link the first stop, and it moves focus to main (AC-5)", async ({
    page,
  }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("main#main-content")).toBeFocused();
  });

  test("tabs through the page in visual order (AC-5)", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Start swiping" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeFocused();
  });

  test("shows a visible focus ring on keyboard focus (AC-5)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    const outline = await page
      .getByRole("link", { name: "Start swiping" })
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          width: style.outlineWidth,
          style: style.outlineStyle,
          offset: style.outlineOffset,
        };
      });

    expect(outline).toEqual({ width: "3px", style: "solid", offset: "3px" });
  });

  test("passes the WCAG A and AA accessibility scan (AC-18)", async ({
    page,
  }) => {
    await page.goto("/");

    const results = await new AxeBuilder({ page })
      .exclude("nextjs-portal")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      ),
    ).toEqual([]);
  });
});

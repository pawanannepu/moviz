import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Spec 0003, AC-14: every page shows the TMDB logo and the required notice.
// The app is dark only (spec 0004), so there is one color mode to check.
test.describe("TMDB footer", () => {
  test("shows the Moviz name, the TMDB logo and the notice", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");

    await expect(footer.getByText("Moviz", { exact: true })).toBeVisible();
    await expect(footer.getByRole("img", { name: "TMDB" })).toBeVisible();
    await expect(
      footer.getByText(
        "This product uses the TMDB API but is not endorsed or certified by TMDB.",
      ),
    ).toBeVisible();
  });

  test("appears exactly once on the page", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("contentinfo")).toHaveCount(1);
  });

  test("keeps the logo smaller than the Moviz name", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");

    const logo = await footer.getByRole("img", { name: "TMDB" }).boundingBox();
    const name = await footer.getByText("Moviz", { exact: true }).boundingBox();

    expect(logo).not.toBeNull();
    expect(name).not.toBeNull();
    expect(logo?.height ?? Infinity).toBeLessThan(name?.height ?? 0);
  });

  test("passes the WCAG A and AA accessibility scan", async ({ page }) => {
    await page.goto("/");

    const results = await new AxeBuilder({ page })
      .include("footer")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

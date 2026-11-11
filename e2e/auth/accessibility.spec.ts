import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import {
  type Account,
  createVerifiedAccount,
  deleteAccountQuietly,
  formAlert,
  rateEmbeddedMoviesInDb,
  signInViaForm,
} from "../support/auth";
import { expect, test } from "../support/unique-ip";

// Feature 18, the accessibility pass. One sweep over every signed in screen,
// driven by the real keyboard: each Tab stop must be visible and show a focus
// ring, Tab must leave the page again (no trap), every state passes axe, and
// each main journey works with keys alone. The signed out pages have the same
// checks in `hardening.spec.ts`, the landing page in `landing.spec.ts`.
// Runs with `playwright.auth.config.ts` and needs the catalog with embeddings.
test.skip(
  !process.env.E2E_AUTH,
  "Run with: pnpm exec playwright test -c playwright.auth.config.ts",
);

const COLD_START_MS = 20_000;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const PHONE = { width: 320, height: 700 };

const made: Account[] = [];

test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({
    baseURL: "http://localhost:3101",
  });
  for (const account of made) await deleteAccountQuietly(request, account);
  await request.dispose();
});

async function newAccount(
  request: APIRequestContext,
  tag: string,
  options: { onboarded?: boolean; liked?: number } = {},
) {
  const account = await createVerifiedAccount(request, `a11y-${tag}`, {
    onboarded: options.onboarded,
  });
  made.push(account);
  if (options.liked)
    await rateEmbeddedMoviesInDb(account.email, options.liked, 9);
  return account;
}

async function expectNoViolations(page: Page, state: string) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes
          .map((node) => node.target.join(" "))
          .join(", ")})`,
    ),
    state,
  ).toEqual([]);
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Waits until React has attached its handlers to the element, so a key press is not lost. */
async function waitForHydration(page: Page, selector: string) {
  await page.waitForFunction((css) => {
    const element = document.querySelector(css);
    return (
      element !== null &&
      Object.keys(element).some((key) => key.startsWith("__reactProps"))
    );
  }, selector);
}

type Stop = { label: string; ring: boolean; shown: boolean };

/**
 * Presses Tab from the top of the page until focus leaves it (or comes back to
 * the first stop) and describes every stop. `left` is false when focus never
 * got out, which would be a keyboard trap.
 */
async function walkTabStops(
  page: Page,
  max = 120,
): Promise<{ stops: Stop[]; left: boolean }> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  const stops: Stop[] = [];
  for (let press = 0; press < max; press++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const store = window as unknown as { __a11yStops?: WeakSet<Element> };
      if (!store.__a11yStops) store.__a11yStops = new WeakSet();
      const seen = store.__a11yStops;
      const repeat = seen.has(element);
      seen.add(element);
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const name =
        element.getAttribute("aria-label") ??
        element.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) ??
        "";
      return {
        repeat,
        label: `${element.tagName.toLowerCase()} "${name}"`,
        ring:
          (style.outlineStyle !== "none" &&
            Number.parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== "none",
        shown:
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity) > 0,
      };
    });
    if (stop === null || stop.repeat) {
      if (stops.length > 0) return { stops, left: true };
      continue;
    }
    stops.push({ label: stop.label, ring: stop.ring, shown: stop.shown });
  }
  return { stops, left: false };
}

async function expectKeyboardReachable(page: Page) {
  const { stops, left } = await walkTabStops(page);
  expect(stops.length, "the page has tab stops").toBeGreaterThan(0);
  expect(left, "Tab gets out of the page again (no keyboard trap)").toBe(true);
  expect(stops[0]?.label, "the skip link is the first stop").toContain(
    "Skip to content",
  );
  expect(
    stops.filter((stop) => !stop.ring).map((stop) => stop.label),
    "every stop shows a focus ring",
  ).toEqual([]);
  expect(
    stops.filter((stop) => !stop.shown).map((stop) => stop.label),
    "every stop is visible",
  ).toEqual([]);
}

/** Presses Tab until `target` has focus, the way a keyboard user gets there. */
async function tabTo(page: Page, target: Locator, max = 120) {
  for (let press = 0; press < max; press++) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab never reached the target");
}

const counter = (page: Page, text: string) =>
  page.locator('[data-slot="onboarding-counter"]', { hasText: text });
const feedItems = (page: Page) => page.locator(".feed-grid > li");

test.describe("onboarding with the keyboard only", () => {
  test("passes axe at 320px, every stop is reachable with a ring, and the deck is finished with Tab and Enter", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(PHONE);
    const account = await newAccount(request, "onboarding", {
      onboarded: false,
    });
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/onboarding", { timeout: COLD_START_MS });
    await waitForHydration(page, '[data-slot="swipe-card"]');

    await expectNoViolations(page, "onboarding deck");
    await expectNoSidewaysScroll(page);
    await expectKeyboardReachable(page);

    // Swipe has a labelled button for each choice (AC-10 of spec 0004).
    for (const name of ["Dislike", "Not seen", "Like"]) {
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }

    const like = page.getByRole("button", { name: "Like", exact: true });
    await tabTo(page, like);
    for (let rated = 1; rated <= 10; rated++) {
      await page.keyboard.press("Enter");
      await expect(
        counter(page, rated < 10 ? `${rated} of 10 rated` : "10 rated"),
      ).toBeVisible({ timeout: COLD_START_MS });
      // Focus stays on the same button of the next card.
      await expect(like).toBeFocused();
    }

    await expectNoViolations(page, "onboarding with the finish button");
    await tabTo(page, page.getByRole("button", { name: "See my picks" }));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/home", { timeout: COLD_START_MS });
  });
});

test.describe("feed and movie page with the keyboard only", () => {
  test("open a pick, go back, and load more, all by keyboard, with axe and focus checks on each page", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(PHONE);
    const account = await newAccount(request, "feed", { liked: 5 });
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home", { timeout: COLD_START_MS });
    await expect(feedItems(page).first()).toBeVisible({
      timeout: COLD_START_MS,
    });
    await waitForHydration(page, ".feed-grid > li a");

    await expectNoViolations(page, "feed");
    await expectNoSidewaysScroll(page);
    await expectKeyboardReachable(page);

    // Open the first pick with Enter.
    const firstCard = feedItems(page).first().getByRole("link");
    await tabTo(page, firstCard);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/movie\/\d+/, { timeout: COLD_START_MS });
    const back = page.getByRole("link", { name: "Back to picks" });
    await expect(back).toBeVisible({ timeout: COLD_START_MS });
    await waitForHydration(page, '[data-slot="movie-detail"] a, main a');

    await expectNoViolations(page, "movie page");
    await expectNoSidewaysScroll(page);
    await expectKeyboardReachable(page);

    // Back to the feed with Enter, then load more with Enter.
    await tabTo(page, back);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/home", { timeout: COLD_START_MS });
    await expect(feedItems(page).first()).toBeVisible({
      timeout: COLD_START_MS,
    });
    const before = await feedItems(page).count();
    const loadMore = page.getByRole("button", { name: "Load more picks" });
    await waitForHydration(page, '[data-slot="load-more-bar"] button');
    await tabTo(page, loadMore);
    await page.keyboard.press("Enter");
    await expect
      .poll(() => feedItems(page).count(), { timeout: COLD_START_MS })
      .toBeGreaterThan(before);
    await expect(loadMore).toBeFocused();
    await expectNoViolations(page, "feed after load more");
  });

  test("a page that does not exist passes axe and can be left by keyboard", async ({
    page,
    request,
  }) => {
    const account = await newAccount(request, "missing");
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home", { timeout: COLD_START_MS });

    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoViolations(page, "not found page");
    await expectKeyboardReachable(page);
  });
});

test.describe("import with the keyboard only", () => {
  test("every state of /import passes axe, and an error is reached and dismissed by keyboard", async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(PHONE);
    const account = await newAccount(request, "import");
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home", { timeout: COLD_START_MS });
    await page.goto("/import");
    await expect(
      page.getByRole("heading", { level: 1, name: "Import from Letterboxd" }),
    ).toBeVisible();
    await waitForHydration(page, 'form button[type="submit"]');

    await expectNoViolations(page, "import, empty");
    await expectNoSidewaysScroll(page);
    await expectKeyboardReachable(page);

    const file = page.getByLabel("ratings.csv");
    await tabTo(page, file);
    const submit = page.getByRole("button", { name: "Import ratings" });
    await tabTo(page, submit);
    await page.keyboard.press("Enter");
    await expect(formAlert(page)).toBeVisible();
    await expect(page.getByText("No file chosen")).toBeVisible();
    await expectNoViolations(page, "import, no file error");
    const retry = page.getByRole("button", { name: "Try again" });
    await tabTo(page, retry);
    await page.keyboard.press("Enter");
    await expect(file).toBeFocused();

    // A real file dialog cannot be driven, so the file is set on the focused field.
    await file.setInputFiles({
      name: "ratings.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Date,Name,Year,Letterboxd URI,Rating\n" +
          "2024-01-01,Heat,1995,https://boxd.it/a,5\n" +
          "2024-01-02,Not A Real Film Title Zzq,1901,https://boxd.it/b,3\n",
      ),
    });
    await tabTo(page, submit);
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: /Imported/ }),
    ).toBeVisible({ timeout: COLD_START_MS });
    await expect(page.getByText("Not A Real Film Title Zzq")).toBeVisible({
      timeout: COLD_START_MS,
    });

    await expectNoViolations(page, "import, with a result and unmatched rows");
    await expectNoSidewaysScroll(page);
    await expectKeyboardReachable(page);
  });
});

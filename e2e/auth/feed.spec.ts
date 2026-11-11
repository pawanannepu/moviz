import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page, Route } from "@playwright/test";
import {
  type Account,
  createVerifiedAccount,
  deleteAccountQuietly,
  rateEmbeddedMoviesInDb,
  signInViaForm,
} from "../support/auth";
import { expect, test } from "../support/unique-ip";

// Spec 0008: the personalized feed. Runs with `playwright.auth.config.ts`, and
// needs a catalog with listable movies. The thin state also needs embeddings
// (`pnpm embed:catalog`) on the database the server uses.
test.skip(
  !process.env.E2E_AUTH,
  "Run with: pnpm exec playwright test -c playwright.auth.config.ts",
);

/** The first request after a quiet spell opens a database connection, which can take a few seconds. */
const COLD_START_MS = 20_000;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const made: Account[] = [];

test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({
    baseURL: "http://localhost:3101",
  });
  for (const account of made) await deleteAccountQuietly(request, account);
  await request.dispose();
});

/** A finished account (no ratings unless `liked` is set), signed in on `/home`. */
async function openFeed(
  page: Page,
  request: APIRequestContext,
  tag: string,
  liked = 0,
) {
  const account = await createVerifiedAccount(request, tag);
  made.push(account);
  if (liked > 0) await rateEmbeddedMoviesInDb(account.email, liked, 9);
  await signInViaForm(page, account.email);
  await expect(page).toHaveURL("/home", { timeout: COLD_START_MS });
  await expect(
    page.getByRole("heading", { level: 1, name: "Your picks" }),
  ).toBeVisible();
  await expect(items(page).first()).toBeVisible({ timeout: COLD_START_MS });
  return account;
}

const items = (page: Page) => page.locator(".feed-grid > li");
const bar = (page: Page) => page.locator('[data-slot="load-more-bar"]');
const loadMore = (page: Page) =>
  page.getByRole("button", { name: "Load more picks" });

/** A click before React has hydrated the button does nothing, so wait for it. */
async function waitForHydratedBar(page: Page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-slot="load-more-bar"] button');
    return (
      button !== null &&
      Object.keys(button).some((key) => key.startsWith("__reactProps"))
    );
  });
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test.describe("the guards (AC-1)", () => {
  test("a signed out visit to /home goes to sign in and remembers the page", async ({
    request,
  }) => {
    const response = await request.get("/home", { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(/\/sign-in\?returnTo=%2Fhome$/);
  });

  test("a user who has not finished onboarding is sent to /onboarding", async ({
    page,
    request,
  }) => {
    const account = await createVerifiedAccount(request, "feed-gate", {
      onboarded: false,
    });
    made.push(account);
    await signInViaForm(page, account.email);

    await expect(page).toHaveURL("/onboarding", { timeout: COLD_START_MS });
    await page.goto("/home");
    await expect(page).toHaveURL("/onboarding");
  });
});

test.describe("the feed (AC-2 to AC-4, AC-15)", () => {
  test("a finished user with no ratings sees popular picks, each with a reason", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "feed-none");

    await expect(
      page.getByText("These are popular films while Moviz learns your taste."),
    ).toBeVisible();
    expect(await items(page).count()).toBeLessThanOrEqual(24);
    for (const reason of await page
      .locator('[data-slot="subtitle-bar"]')
      .allTextContents()) {
      expect(reason).toBe("Popular with film fans");
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("a user with a few likes sees the early picks line and named reasons", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "feed-thin", 3);

    await expect(
      page.getByText(
        "Early picks from just a few ratings. They get sharper as Moviz learns your taste.",
      ),
    ).toBeVisible();
    await expect(
      page.locator('[data-slot="subtitle-bar"]').first(),
    ).toContainText(/^Because you loved .+/);

    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("the layout holds from 320 to 1280 px, with reduced motion", async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFeed(page, request, "feed-widths");

    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("Load more (AC-8, AC-9, AC-10, AC-15)", () => {
  test("a keyboard press adds picks, announces the count and keeps focus", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "feed-more");
    test.skip(
      (await loadMore(page).count()) === 0,
      "The catalog is one batch.",
    );
    await waitForHydratedBar(page);
    const before = await items(page).count();

    await loadMore(page).focus();
    await page.keyboard.press("Enter");

    await expect(items(page)).not.toHaveCount(before);
    await expect(page.getByRole("status").last()).toHaveText(
      /^\d+ more picks? loaded$/,
    );
    // Focus stays on the button, or moves to the done line when that was the last batch.
    await expect(
      page.locator(
        '[data-slot="load-more-bar"] button:focus, [data-slot="load-more-bar"] p:focus',
      ),
    ).toHaveCount(1);

    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("a slow call shows the pending state, ignores a second press and passes axe", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "feed-pending");
    test.skip(
      (await loadMore(page).count()) === 0,
      "The catalog is one batch.",
    );
    await waitForHydratedBar(page);

    let actionCalls = 0;
    await page.route("**/home", async (route) => {
      if (!("next-action" in route.request().headers())) {
        return route.continue();
      }
      actionCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return route.continue();
    });

    const box = await loadMore(page).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await loadMore(page).click();
    const pending = page.getByRole("button", { name: "Loading more picks" });
    await expect(pending).toHaveAttribute("aria-disabled", "true");
    await expect(pending).toHaveAttribute("aria-busy", "true");
    await expect(pending).toBeFocused();
    await pending.click({ force: true });

    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await expect(pending).toBeHidden({ timeout: COLD_START_MS });
    expect(actionCalls).toBe(1);
  });

  test("a dropped call keeps the picks, shows a retry that takes focus, and retrying works", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "feed-fail");
    test.skip(
      (await loadMore(page).count()) === 0,
      "The catalog is one batch.",
    );
    await waitForHydratedBar(page);
    const before = await items(page).count();

    const isAction = (route: Route) =>
      "next-action" in route.request().headers();
    await page.route("**/home", (route) =>
      isAction(route) ? route.abort() : route.continue(),
    );

    await loadMore(page).click();

    await expect(
      page.getByText(
        "We couldn't load more picks. Check your connection and try again.",
      ),
    ).toBeVisible();
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeFocused();
    await expect(items(page)).toHaveCount(before);

    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.unroute("**/home");
    await retry.click();
    await expect(items(page)).not.toHaveCount(before);
    await expect(bar(page)).not.toContainText("We couldn't load more picks");
  });
});

test.describe("the first batch arrives with the page (AC-16)", () => {
  test("a page load makes no second request for the picks", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "feed-onepass");

    const extra: string[] = [];
    page.on("request", (req) => {
      const headers = req.headers();
      const isAction = "next-action" in headers;
      const isHomeData =
        new URL(req.url()).pathname === "/home" && "rsc" in headers;
      if (isAction || isHomeData) extra.push(`${req.method()} ${req.url()}`);
    });
    await page.goto("/home");
    await expect(items(page).first()).toBeVisible({ timeout: COLD_START_MS });

    expect(extra).toEqual([]);

    // The reason text is already in the document response, not fetched after it.
    const html = await (await page.context().request.get("/home")).text();
    expect(html).toContain("Popular with film fans");
  });

  test("a browser without JavaScript is told to turn it on", async ({
    page,
    request,
    browser,
  }) => {
    await openFeed(page, request, "feed-nojs");
    // With JavaScript on, the noscript line is not shown.
    await expect(
      page.getByText(
        "Moviz needs JavaScript to show your picks. Turn it on and reload the page.",
      ),
    ).toBeHidden();
    const state = await page.context().storageState();

    const plain = await browser.newContext({
      javaScriptEnabled: false,
      storageState: state,
      baseURL: "http://localhost:3101",
    });
    const bare = await plain.newPage();
    await bare.goto("/home");

    const heading = bare.getByRole("heading", { level: 1, name: "Your picks" });
    // Playwright's text matching skips noscript content, so use a selector.
    const line = bare.locator("noscript p");
    await expect(heading).toBeVisible();
    await expect(line).toHaveText(
      "Moviz needs JavaScript to show your picks. Turn it on and reload the page.",
    );
    await expect(line).toBeVisible();
    // The line sits below the heading and above the loading state.
    const [headingBox, lineBox] = await Promise.all([
      heading.boundingBox(),
      line.boundingBox(),
    ]);
    expect(lineBox?.y ?? 0).toBeGreaterThan(headingBox?.y ?? 0);
    await plain.close();
  });
});

import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import {
  type Account,
  createVerifiedAccount,
  deleteAccountQuietly,
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

const removeStartMarker = (page: Page) =>
  page.evaluate(() => document.getElementById("__a11y-start")?.remove());

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
  // Blur alone keeps the browser's focus starting point where focus last was,
  // so park focus on a non tabbable marker at the very top of the body.
  await page.evaluate(() => {
    // Client navigation keeps `window`, so forget the stops of an earlier walk.
    delete (window as unknown as { __a11yStops?: WeakSet<Element> })
      .__a11yStops;
    const marker = document.createElement("span");
    marker.id = "__a11y-start";
    marker.tabIndex = -1;
    document.body.prepend(marker);
    marker.focus();
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
        // The ring may be drawn on the element or, for a stretched card link,
        // on the nearest card around it (`has-[a:focus-visible]`).
        ring: (() => {
          for (
            let node: Element | null = element, depth = 0;
            node && depth < 4;
            node = node.parentElement, depth++
          ) {
            const own = getComputedStyle(node);
            if (
              (own.outlineStyle !== "none" &&
                Number.parseFloat(own.outlineWidth) > 0) ||
              own.boxShadow !== "none"
            )
              return true;
          }
          return false;
        })(),
        shown:
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity) > 0,
      };
    });
    if (stop === null || stop.repeat) {
      if (stops.length > 0) {
        await removeStartMarker(page);
        return { stops, left: true };
      }
      continue;
    }
    stops.push({ label: stop.label, ring: stop.ring, shown: stop.shown });
  }
  await removeStartMarker(page);
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
    // The title streams in with the page metadata (spec 0010, AC-19).
    await expect(page).toHaveTitle(/\S.* · Moviz$/, { timeout: COLD_START_MS });
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
    await expect(
      page.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);
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
    await expect(
      page.getByRole("alert").filter({ hasText: "No file chosen" }),
    ).toBeVisible();
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

test.describe("lists with the keyboard only", () => {
  test("both lists pass axe empty and filled, and a saved movie is rated by keyboard with focus moved to its new list", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(PHONE);
    const account = await newAccount(request, "lists", { liked: 3 });
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home", { timeout: COLD_START_MS });

    // Seen list filled from the ratings, watchlist empty.
    await page.goto("/lists");
    await expect(
      page.getByRole("heading", { level: 1, name: "Your lists" }),
    ).toBeVisible({ timeout: COLD_START_MS });
    await expect(page.locator("main")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Your watchlist is waiting" }),
    ).toBeVisible();
    await waitForHydration(page, "#seen select");
    await expectNoViolations(page, "lists, empty watchlist");
    await expectNoSidewaysScroll(page);
    await expectKeyboardReachable(page);

    // Save the first pick to the watchlist from its movie page, by keyboard.
    await page.goto("/home");
    await expect(feedItems(page).first()).toBeVisible({
      timeout: COLD_START_MS,
    });
    await waitForHydration(page, ".feed-grid > li a");
    await tabTo(page, feedItems(page).first().getByRole("link"));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/movie\/\d+/, { timeout: COLD_START_MS });
    // The skeleton has its own h1 ("Loading movie"), so wait for the real one.
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
      "Loading movie",
      { timeout: COLD_START_MS },
    );
    const title = (
      await page.getByRole("heading", { level: 1 }).textContent()
    )?.trim();
    expect(title).toBeTruthy();
    const save = page.getByRole("button", { name: "Add to watchlist" });
    await waitForHydration(page, "main button");
    await tabTo(page, save);
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "Saved to your watchlist." }),
    ).toBeVisible({ timeout: COLD_START_MS });
    await expect(
      page.getByRole("button", { name: "Remove from watchlist" }),
    ).toBeFocused();

    // Both lists filled.
    await page.goto("/lists");
    const card = page.getByRole("group", {
      name: `List actions for ${title}`,
    });
    await expect(card).toBeVisible({ timeout: COLD_START_MS });
    await waitForHydration(page, "#watchlist select");
    await expectNoViolations(page, "lists, both filled");
    await expectKeyboardReachable(page);

    // The select is named by its visible label (label in name).
    const rating = card.getByRole("combobox", {
      name: "Mark seen with a rating",
    });
    await tabTo(page, rating);
    await rating.selectOption("8");
    await tabTo(page, card.getByRole("button", { name: "Save rating" }));
    await page.keyboard.press("Enter");
    // The card leaves the watchlist, so focus moves to the list it joined.
    await expect(
      page.getByRole("heading", { level: 2, name: "Seen and rated" }),
    ).toBeFocused({ timeout: COLD_START_MS });
    await expect(
      page.getByRole("heading", { name: "Your watchlist is waiting" }),
    ).toBeVisible({ timeout: COLD_START_MS });
    await expectNoViolations(page, "lists, after rating a saved movie");
  });
});

test.describe("search with the keyboard only", () => {
  test("every state of /search passes axe, an example fills the field, and focus follows each outcome", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(PHONE);
    const account = await newAccount(request, "search", { liked: 5 });
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home", { timeout: COLD_START_MS });
    await page.goto("/search");
    await expect(
      page.getByRole("heading", { level: 1, name: "Search by mood" }),
    ).toBeVisible({ timeout: COLD_START_MS });
    await waitForHydration(page, 'form button[type="submit"]');

    await expectNoViolations(page, "search, idle");
    await expectNoSidewaysScroll(page);
    await expectKeyboardReachable(page);

    const field = page.getByLabel("Describe what you feel like watching");
    const submit = page.getByRole("button", { name: "Find picks" });

    // A phrase that is too short: the field says so and keeps focus.
    await tabTo(page, field);
    await page.keyboard.type("a");
    await tabTo(page, submit);
    await page.keyboard.press("Enter");
    await expect(page.getByText("Type at least 2 characters.")).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expectNoViolations(page, "search, phrase too short");

    // An example fills the field, does not search, and sends focus back.
    const example = page.getByRole("button", {
      name: "a slow moody thriller from the 90s",
    });
    await tabTo(page, example);
    await page.keyboard.press("Enter");
    await expect(field).toHaveValue("a slow moody thriller from the 90s");
    await expect(field).toBeFocused();

    // A real search: focus lands on the heading of what it produced.
    await tabTo(page, submit);
    await page.keyboard.press("Enter");
    const outcome = page.locator(
      '[data-slot="search-results"] h2, [data-slot="search-empty"] h2, [data-slot="search-error"], [data-slot="search-quota"]',
    );
    await expect(outcome.first()).toBeFocused({ timeout: 30_000 });
    await expectNoViolations(page, "search, after a search");
    await expectNoSidewaysScroll(page);
    await expectKeyboardReachable(page);
  });
});

test.describe("account with the keyboard only", () => {
  test("/account passes axe at 320px, every stop has a ring, and an empty delete is caught by keyboard", async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(PHONE);
    const account = await newAccount(request, "account");
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home", { timeout: COLD_START_MS });
    await page.goto("/account");
    await expect(
      page.getByRole("heading", { level: 1, name: "Account" }),
    ).toBeVisible({ timeout: COLD_START_MS });
    await waitForHydration(page, 'form[aria-busy] button[type="submit"]');

    await expectNoViolations(page, "account");
    await expectNoSidewaysScroll(page);
    await expectKeyboardReachable(page);

    // No password: the field error shows and the field takes focus. Nothing
    // is deleted, so the account is still there for cleanup.
    const remove = page.getByRole("button", { name: "Delete my account" });
    await tabTo(page, remove);
    await page.keyboard.press("Enter");
    const password = page.getByLabel("Your password");
    await expect(password).toBeFocused();
    await expect(password).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Enter your password.")).toBeVisible();
    await expect(page).toHaveURL("/account");
    await expectNoViolations(page, "account, password missing");
  });
});

test.describe("legal pages with the keyboard only", () => {
  for (const path of ["/privacy", "/terms"]) {
    test(`${path} passes axe at 320px signed out, and every stop has a ring`, async ({
      page,
    }) => {
      await page.setViewportSize(PHONE);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoViolations(page, path);
      await expectNoSidewaysScroll(page);
      await expectKeyboardReachable(page);

      // The first "On this page" link moves to its section.
      const nav = page.getByRole("navigation", { name: "On this page" });
      const first = nav.getByRole("link").first();
      await tabTo(page, first);
      const target = await first.getAttribute("href");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`${target}$`));
    });
  }
});

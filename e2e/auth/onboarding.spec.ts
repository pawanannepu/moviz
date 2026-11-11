import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  type Account,
  AUTH_SERVER_LOG,
  createVerifiedAccount,
  deleteAccountQuietly,
  signInViaForm,
} from "../support/auth";
import { expect, test } from "../support/unique-ip";

// Spec 0006: the first run swipe deck. Runs with `playwright.auth.config.ts`.
test.skip(
  !process.env.E2E_AUTH,
  "Run with: pnpm exec playwright test -c playwright.auth.config.ts",
);

/** The first request after a quiet spell opens a database connection, which can take a few seconds. */
const COLD_START_MS = 20_000;

const made: Account[] = [];

test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({
    baseURL: "http://localhost:3101",
  });
  for (const account of made) await deleteAccountQuietly(request, account);
  await request.dispose();
});

/** A new account that has not finished onboarding, signed in on `/onboarding`. */
async function startOnboarding(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
  tag: string,
) {
  const account = await createVerifiedAccount(request, tag, {
    onboarded: false,
  });
  made.push(account);
  await signInViaForm(page, account.email);
  await expect(page).toHaveURL("/onboarding", { timeout: COLD_START_MS });
  await expect(
    page.getByRole("heading", { name: "What do you think of these?" }),
  ).toBeVisible();
  // The server sends the card before React can react to a key press: wait for hydration.
  await page.waitForFunction(() => {
    const swipeCard = document.querySelector('[data-slot="swipe-card"]');
    return (
      swipeCard !== null &&
      Object.keys(swipeCard).some((key) => key.startsWith("__reactProps"))
    );
  });
  return account;
}

/** The visible counter only, not the screen reader message that repeats it. */
const counter = (page: import("@playwright/test").Page, text: string) =>
  page.locator('[data-slot="onboarding-counter"]', { hasText: text });

const card = (page: import("@playwright/test").Page) =>
  page.locator('[data-slot="swipe-card"]');

/** Presses one of the three card buttons once the previous swipe has settled. */
async function press(
  page: import("@playwright/test").Page,
  name: "Like" | "Dislike" | "Not seen",
) {
  await page.getByRole("button", { name, exact: true }).click();
}

test.describe("the gate (AC-1)", () => {
  test("a signed out visit to /onboarding goes to sign in and remembers the page", async ({
    request,
  }) => {
    const response = await request.get("/onboarding", { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(
      /\/sign-in\?returnTo=%2Fonboarding$/,
    );
  });

  test("an unfinished user is sent from /home to /onboarding, and a finished one back from /onboarding to /home", async ({
    page,
    request,
  }) => {
    await startOnboarding(page, request, "gate");
    await page.goto("/home");
    await expect(page).toHaveURL("/onboarding", { timeout: COLD_START_MS });

    const finished = await createVerifiedAccount(request, "gate-done");
    made.push(finished);
    await page.context().clearCookies();
    await signInViaForm(page, finished.email);
    await expect(page).toHaveURL("/home");
    await page.goto("/onboarding");
    await expect(page).toHaveURL("/home");
    await expect(
      page.getByRole("heading", { level: 1, name: "Your picks" }),
    ).toBeVisible();
  });
});

test.describe("swiping to the feed (AC-3, AC-4, AC-7)", () => {
  test("ten likes by button show See my picks, which finishes and replaces the history entry", async ({
    page,
    request,
  }) => {
    await startOnboarding(page, request, "flow");
    await expect(counter(page, "0 of 10 rated")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "See my picks" }),
    ).toHaveCount(0);

    for (let rated = 1; rated <= 9; rated++) {
      await press(page, "Like");
      await expect(counter(page, `${rated} of 10 rated`)).toBeVisible();
    }
    await press(page, "Like");
    await expect(counter(page, "10 rated")).toBeVisible();

    await page.getByRole("button", { name: "See my picks" }).click();
    // The finish call and the feed page's first script take a few seconds on a cold start.
    await expect(page).toHaveURL("/home", { timeout: COLD_START_MS });
    await expect(
      page.getByRole("heading", { level: 1, name: "Your picks" }),
    ).toBeVisible();

    await page.goBack();
    await expect(page).not.toHaveURL(/\/onboarding$/);
  });

  test("a card is decided by the arrow keys too, and not seen does not count as rated", async ({
    page,
    request,
  }) => {
    await startOnboarding(page, request, "keys");

    /** Presses a key on the focused card, then waits for the next card to take its place and focus. */
    async function decideByKey(key: string) {
      const before = await card(page).getAttribute("aria-label");
      await card(page).focus();
      await page.keyboard.press(key);
      await expect(card(page)).not.toHaveAttribute(
        "aria-label",
        before as string,
      );
      await expect(card(page)).toBeFocused();
    }

    await decideByKey("ArrowRight");
    await expect(counter(page, "1 of 10 rated")).toBeVisible();

    await decideByKey("ArrowUp");
    await expect(
      page.getByRole("button", { name: "Undo last swipe" }),
    ).toBeVisible();
    await expect(counter(page, "1 of 10 rated")).toBeVisible();

    await decideByKey("ArrowLeft");
    await expect(counter(page, "2 of 10 rated")).toBeVisible();
  });
});

test.describe("undo and coming back (AC-5, AC-6)", () => {
  test("undo brings the movie back and takes the count down; a reload forgets the undo but not the swipes", async ({
    page,
    request,
  }) => {
    await startOnboarding(page, request, "undo");
    const firstLabel = await card(page).getAttribute("aria-label");

    await press(page, "Like");
    await expect(counter(page, "1 of 10 rated")).toBeVisible();
    await page.getByRole("button", { name: "Undo last swipe" }).click();
    await expect(counter(page, "0 of 10 rated")).toBeVisible();
    await expect(card(page)).toHaveAttribute(
      "aria-label",
      firstLabel as string,
    );
    await expect(card(page)).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Undo last swipe" }),
    ).toHaveCount(0);

    await press(page, "Not seen");
    await page.getByRole("button", { name: "Undo last swipe" }).click();
    await expect(card(page)).toHaveAttribute(
      "aria-label",
      firstLabel as string,
    );

    await press(page, "Like");
    await expect(counter(page, "1 of 10 rated")).toBeVisible();
    await press(page, "Dislike");
    await expect(counter(page, "2 of 10 rated")).toBeVisible();

    await page.reload();
    await expect(counter(page, "2 of 10 rated")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Undo last swipe" }),
    ).toHaveCount(0);
  });
});

test.describe("accessibility (AC-12)", () => {
  test("at 320px wide the deck has no horizontal scroll and no axe violations", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await startOnboarding(page, request, "a11y");
    await press(page, "Like");
    await expect(counter(page, "1 of 10 rated")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("with reduced motion the deck still works", async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await startOnboarding(page, request, "motion");
    await press(page, "Like");
    await expect(counter(page, "1 of 10 rated")).toBeVisible();
  });
});

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const undoButton = (page: Page) =>
  page.getByRole("button", { name: "Undo last swipe" });

const endHeading = (page: Page) =>
  page.getByRole("heading", { name: "That's plenty" });

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Presses a card button and waits until the next card (or the end state) has taken its place. */
async function swipeAndSettle(
  page: Page,
  name: "Like" | "Dislike" | "Not seen",
) {
  const before = await card(page).getAttribute("aria-label");
  await press(page, name);
  await expect(undoButton(page)).toBeVisible();
  await expect(async () => {
    const after = await card(page)
      .getAttribute("aria-label", { timeout: 500 })
      .catch(() => null);
    expect(after).not.toBe(before);
  }).toPass();
}

/** Drags the card by (dx, dy) pixels with the mouse and waits for the next card. */
async function dragCard(page: Page, dx: number, dy: number) {
  const before = await card(page).getAttribute("aria-label");
  const box = await card(page).boundingBox();
  if (!box) throw new Error("The card has no box to drag");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
  await expect(card(page)).not.toHaveAttribute("aria-label", before as string, {
    timeout: 15_000,
  });
}

/** Presses Tab until the focused element satisfies `match`, so no mouse is needed to reach it. */
async function tabTo(
  page: Page,
  match: (focused: { slot: string | null; text: string }) => boolean,
) {
  for (let step = 0; step < 30; step++) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => ({
      slot: document.activeElement?.getAttribute("data-slot") ?? null,
      text: (document.activeElement?.textContent ?? "").trim(),
    }));
    if (match(focused)) return;
  }
  throw new Error("Tab never reached the control");
}

test.describe("swiping by drag (AC-3)", () => {
  test("a drag right likes, left dislikes and up marks not seen", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await startOnboarding(page, request, "drag");

    await dragCard(page, 300, 0);
    await expect(counter(page, "1 of 10 rated")).toBeVisible();
    await dragCard(page, -300, 0);
    await expect(counter(page, "2 of 10 rated")).toBeVisible();
    await dragCard(page, 0, -300);

    await expect(counter(page, "2 of 10 rated")).toBeVisible();
    await expect(undoButton(page)).toBeVisible();
  });
});

test.describe("the end state (AC-8, AC-12)", () => {
  test("10 ratings and 30 cards dealt end the deck: heading focus, no violations at 320px, undo returns to the deck", async ({
    page,
    request,
  }) => {
    test.setTimeout(400_000);
    await page.setViewportSize({ width: 320, height: 640 });
    await startOnboarding(page, request, "end");

    for (let rated = 1; rated <= 10; rated++)
      await swipeAndSettle(page, "Like");
    await expect(
      page.getByRole("button", { name: "See my picks" }),
    ).toBeVisible();
    const withFinish = await new AxeBuilder({ page })
      .withTags(AXE_TAGS)
      .analyze();
    expect(withFinish.violations).toEqual([]);

    for (let skipped = 1; skipped <= 20; skipped++) {
      await swipeAndSettle(page, "Not seen");
    }

    await expect(endHeading(page)).toBeVisible();
    await expect(endHeading(page)).toBeFocused();
    await expect(page.getByText("Your picks are ready.")).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const ended = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(ended.violations).toEqual([]);

    await undoButton(page).click();
    await expect(endHeading(page)).toHaveCount(0);
    await expect(card(page)).toBeFocused();
    await expect(counter(page, "10 rated")).toBeVisible();
  });
});

test.describe("keyboard only (AC-3, AC-5, AC-7, AC-12)", () => {
  test("every swipe, the undo and the finish are reachable at 320px without a mouse", async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 320, height: 640 });
    await startOnboarding(page, request, "keyboard");

    await tabTo(page, (focused) => focused.slot === "swipe-card");
    await page.keyboard.press("ArrowRight");
    await expect(counter(page, "1 of 10 rated")).toBeVisible();
    await expect(card(page)).toBeFocused();

    await tabTo(page, (focused) => focused.text.includes("Undo last swipe"));
    await page.keyboard.press("Enter");
    await expect(counter(page, "0 of 10 rated")).toBeVisible();
    await expect(card(page)).toBeFocused();

    for (let rated = 1; rated <= 10; rated++) {
      await card(page).focus();
      const before = await card(page).getAttribute("aria-label");
      await page.keyboard.press("ArrowRight");
      await expect(card(page)).not.toHaveAttribute(
        "aria-label",
        before as string,
      );
    }
    await expect(counter(page, "10 rated")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await tabTo(page, (focused) => focused.text === "See my picks");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/home");
  });
});

test.describe("when something fails (AC-10)", () => {
  test("a failed save keeps the card and the count, and the same swipe works on a retry", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await startOnboarding(page, request, "failsave");
    const first = await card(page).getAttribute("aria-label");

    await page.route("**/onboarding", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );
    await press(page, "Like");
    await expect(
      page.locator("p.text-destructive", {
        hasText: "Couldn't save that swipe. Try again.",
      }),
    ).toBeVisible();
    await expect(card(page)).toHaveAttribute("aria-label", first as string);
    await expect(counter(page, "0 of 10 rated")).toBeVisible();

    await page.unroute("**/onboarding");
    await press(page, "Like");
    await expect(counter(page, "1 of 10 rated")).toBeVisible();
    await expect(page.locator("p.text-destructive")).toHaveCount(0);
  });

  test("a failed finish says so, leaves the page as it was and keeps focus on the button", async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    await startOnboarding(page, request, "failfinish");
    for (let rated = 1; rated <= 10; rated++)
      await swipeAndSettle(page, "Like");
    const finish = page.getByRole("button", { name: "See my picks" });

    await page.route("**/onboarding", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );
    await finish.focus();
    await finish.click();

    await expect(
      page.locator("p.text-destructive", {
        hasText: "Couldn't finish just now. Try again.",
      }),
    ).toBeVisible();
    await expect(page).toHaveURL("/onboarding");
    await expect(finish).toBeFocused();
  });

  test("while a save is in flight the controls are disabled and a second press does nothing", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await startOnboarding(page, request, "inflight");
    let posts = 0;
    page.on("request", (sent) => {
      if (sent.method() === "POST" && sent.url().endsWith("/onboarding"))
        posts++;
    });
    await page.route("**/onboarding", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((wait) => setTimeout(wait, 2500));
      }
      await route.continue();
    });

    await press(page, "Like");
    await expect(
      page.getByRole("button", { name: "Like", exact: true }),
    ).toHaveAttribute("aria-disabled", "true");
    await page
      .getByRole("button", { name: "Dislike", exact: true })
      .click({ force: true, timeout: 1_000 })
      .catch(() => undefined);

    await expect(counter(page, "1 of 10 rated")).toBeVisible({
      timeout: 15_000,
    });
    expect(posts).toBe(1);
  });

  test("swiping after the account was deleted sends the person to sign in", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const account = await startOnboarding(page, request, "deleted");
    await deleteAccountQuietly(request, account);

    await press(page, "Like");

    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fonboarding$/, {
      timeout: 30_000,
    });
  });
});

test.describe("what the server logs (AC-11)", () => {
  test("a run of swipes leaves no movie, choice or score in the server log", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await startOnboarding(page, request, "logs");
    const titles: string[] = [];
    for (const name of ["Like", "Dislike", "Not seen"] as const) {
      const label = (await card(page).getAttribute("aria-label")) ?? "";
      titles.push(label.replace(/, \d{4}$/, ""));
      await swipeAndSettle(page, name);
    }
    await undoButton(page).click();
    await expect(counter(page, "2 of 10 rated")).toBeVisible();

    const log = readFileSync(AUTH_SERVER_LOG, "utf8");

    expect(titles).toHaveLength(3);
    for (const title of titles) expect(log).not.toContain(title);
    expect(log).not.toMatch(/\b(liked|disliked|not_seen)\b/i);
    expect(log).not.toMatch(/\bscore\b/i);
  });
});

import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import { Pool } from "pg";
import {
  type Account,
  createVerifiedAccount,
  deleteAccountQuietly,
  rateEmbeddedMoviesInDb,
  signInViaForm,
} from "../support/auth";
import { expect, test } from "../support/unique-ip";

// Spec 0011: "Not interested" and "More like this" on feed cards and on the
// movie page. Runs with `playwright.auth.config.ts`, and needs a catalog with
// listable movies and embeddings on the database the server uses.
test.skip(
  !process.env.E2E_AUTH,
  "Run with: pnpm exec playwright test -c playwright.auth.config.ts",
);

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

const items = (page: Page) => page.locator(".feed-grid > li");
const status = (page: Page, text: string | RegExp) =>
  page.getByRole("status").filter({ hasText: text });

/** A finished account with five liked ratings, signed in on a hydrated `/home`. */
async function openFeed(page: Page, request: APIRequestContext, tag: string) {
  const account = await createVerifiedAccount(request, tag);
  made.push(account);
  await rateEmbeddedMoviesInDb(account.email, 5, 9);
  await signInViaForm(page, account.email);
  await expect(page).toHaveURL("/home", { timeout: COLD_START_MS });
  await expect(items(page).first()).toBeVisible({ timeout: COLD_START_MS });
  await page.waitForFunction(() => {
    const button = document.querySelector(
      '.feed-grid > li [data-slot="feedback-controls"] button',
    );
    return (
      button !== null &&
      Object.keys(button).some((key) => key.startsWith("__reactProps"))
    );
  });
  return account;
}

/** The first card's movie id and title. */
async function firstCard(page: Page) {
  const item = items(page).first();
  const id = Number(await item.getAttribute("data-movie-id"));
  const title = ((await item.locator("h3").textContent()) ?? "").trim();
  return { id, title, item };
}

test.describe("feed cards (AC-1 to AC-5, AC-12)", () => {
  test("Not interested hides the card in place, Undo brings it back, and a hidden movie stays gone", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "fb-hide");
    const { id, title, item } = await firstCard(page);

    const notInterested = item.getByRole("button", {
      name: `Not interested in ${title}`,
    });
    const moreLike = item.getByRole("button", {
      name: `More like this: ${title}`,
    });
    await expect(notInterested).toBeVisible();
    await expect(moreLike).toHaveAttribute("aria-pressed", "false");
    for (const button of [notInterested, moreLike]) {
      const box = await button.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await notInterested.click();
    // A press never opens the movie page.
    await expect(page).toHaveURL("/home");
    await expect(item).toContainText("Hidden from your picks.");
    const undo = item.getByRole("button", { name: `Undo hiding ${title}` });
    await expect(undo).toBeFocused();
    await expect(status(page, `${title} hidden from your picks`)).toHaveCount(
      1,
    );
    expect(
      await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze(),
    ).toHaveProperty("violations", []);

    await undo.click();
    await expect(item.locator("h3")).toHaveText(title);
    await expect(
      item.getByRole("button", { name: `Not interested in ${title}` }),
    ).toBeFocused();

    // Hide it for good, then reload: the movie is not in a new visit's feed.
    await item
      .getByRole("button", { name: `Not interested in ${title}` })
      .click();
    await expect(item).toContainText("Hidden from your picks.");
    await page.reload();
    await expect(items(page).first()).toBeVisible({ timeout: COLD_START_MS });
    await expect(
      page.locator(`.feed-grid > li[data-movie-id="${id}"]`),
    ).toHaveCount(0);
  });

  test("More like this toggles, keeps focus, survives a reload and shapes the next picks", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "fb-more");
    const { id, title, item } = await firstCard(page);
    const moreLike = item.getByRole("button", {
      name: `More like this: ${title}`,
    });

    await moreLike.click();
    await expect(moreLike).toHaveAttribute("aria-pressed", "true");
    await expect(moreLike).toBeFocused();
    await expect(
      status(page, `More like ${title} on your next picks`),
    ).toHaveCount(1);
    await expect(moreLike).toHaveText("More like this");

    await moreLike.click();
    await expect(moreLike).toHaveAttribute("aria-pressed", "false");
    await expect(status(page, `Removed more like ${title}`)).toHaveCount(1);

    await moreLike.click();
    await expect(moreLike).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(items(page).first()).toBeVisible({ timeout: COLD_START_MS });
    const again = page.locator(`.feed-grid > li[data-movie-id="${id}"]`);
    if ((await again.count()) > 0) {
      await expect(
        again.getByRole("button", { name: `More like this: ${title}` }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    // The movie is an anchor now, so some pick names it.
    await expect(
      page.locator(".feed-grid").getByText(`More like ${title}`, {
        exact: false,
      }),
    ).not.toHaveCount(0);
  });

  test("a failed save changes nothing and says so", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "fb-fail");
    const { title, item } = await firstCard(page);
    await page.route("**/home", async (route) => {
      if (route.request().headers()["next-action"]) {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    const notInterested = item.getByRole("button", {
      name: `Not interested in ${title}`,
    });
    await notInterested.click();
    await expect(item.getByRole("alert")).toHaveText(
      "Could not save. Try again.",
    );
    await expect(item.locator("h3")).toHaveText(title);
    await expect(notInterested).toBeFocused();
  });
});

test.describe("movie page (AC-11, AC-15)", () => {
  test("hiding from the page shows Undo, the kept feed leaves the pick out, and the page reopens hidden", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "fb-page");
    const { id, title, item } = await firstCard(page);

    await item.locator("h3 a").click();
    await expect(page).toHaveURL(`/movie/${id}`);
    const detail = page.locator('[data-slot="movie-detail"]');
    await detail
      .getByRole("button", { name: `Not interested in ${title}` })
      .click();
    const undo = detail.getByRole("button", { name: `Undo hiding ${title}` });
    await expect(undo).toBeFocused();
    await expect(detail).toContainText("Hidden from your picks.");

    // Back to the kept feed: the pick is gone, with no Hidden line.
    await page.goBack();
    await expect(page).toHaveURL("/home");
    await expect(items(page).first()).toBeVisible();
    await expect(
      page.locator(`.feed-grid > li[data-movie-id="${id}"]`),
    ).toHaveCount(0);
    await expect(page.getByText("Hidden from your picks.")).toHaveCount(0);

    // Opened by address, the page starts hidden: the way back for a dismissed movie.
    await page.goto(`/movie/${id}`);
    const reopened = page
      .locator('[data-slot="movie-detail"]')
      .getByRole("button", { name: `Undo hiding ${title}` });
    await expect(reopened).toBeVisible({ timeout: COLD_START_MS });
    expect(
      await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze(),
    ).toHaveProperty("violations", []);
    await reopened.click();
    await expect(
      page.getByRole("button", { name: `Not interested in ${title}` }),
    ).toBeFocused();
  });
});

/** Runs one query on the database the server uses (the local env file, or the real environment). */
async function onServerDb(text: string, values: unknown[]) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No local env file (for example in CI). The real environment is used.
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await pool.query(text, values);
  } finally {
    await pool.end();
  }
}

const ids = (page: Page) =>
  items(page).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-movie-id")),
  );

test.describe("pending and an ended session (AC-5, AC-12)", () => {
  test("a press waits for the server: both buttons are aria-disabled, a second press sends nothing, other picks stay", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "fb-pend");
    const before = await ids(page);
    const { title, item } = await firstCard(page);
    let actions = 0;
    await page.route("**/home", async (route) => {
      if (route.request().headers()["next-action"]) {
        actions++;
        await new Promise((done) => setTimeout(done, 2000));
      }
      await route.continue();
    });
    const moreLike = item.getByRole("button", {
      name: `More like this: ${title}`,
    });
    const notInterested = item.getByRole("button", {
      name: `Not interested in ${title}`,
    });

    await moreLike.click();
    await expect(moreLike).toHaveAttribute("aria-disabled", "true");
    await expect(notInterested).toHaveAttribute("aria-disabled", "true");
    await moreLike.click({ force: true });
    await notInterested.click({ force: true });

    await expect(moreLike).toHaveAttribute("aria-pressed", "true", {
      timeout: 10_000,
    });
    await expect(moreLike).not.toHaveAttribute("aria-disabled", "true");
    expect(actions).toBe(1);
    expect(await ids(page)).toEqual(before);
  });

  test("a session ended on the server shows Sign in again back to the feed, with focus", async ({
    page,
    request,
  }) => {
    const account = await openFeed(page, request, "fb-out");
    const { title, item } = await firstCard(page);
    // Revoke the session and keep the cookie, as a sign out in another tab does.
    await onServerDb(
      `delete from session where user_id = (select id from "user" where email = $1)`,
      [account.email],
    );

    await item
      .getByRole("button", { name: `More like this: ${title}` })
      .click();

    const link = item.getByRole("link", { name: "Sign in again" });
    await expect(item).toContainText("Your session ended.");
    await expect(link).toBeFocused();
    await expect(link).toHaveAttribute("href", "/sign-in?returnTo=%2Fhome");
    await expect(
      item.getByRole("button", { name: `More like this: ${title}` }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("the kept feed and the movie page (AC-1, AC-11, AC-15)", () => {
  test("the card body still opens the page, and changes made there reach the kept feed", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "fb-keep");
    const second = items(page).nth(1);
    const id = Number(await second.getAttribute("data-movie-id"));
    const title = ((await second.locator("h3").textContent()) ?? "").trim();
    // The stretched link covers the poster, so a click there opens the movie.
    const box = await second.locator("img").first().boundingBox();
    if (!box) throw new Error("no poster box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).toHaveURL(`/movie/${id}`);
    const detail = page.locator('[data-slot="movie-detail"]');

    const moreLike = detail.getByRole("button", {
      name: `More like this: ${title}`,
    });
    await moreLike.click();
    await expect(moreLike).toHaveAttribute("aria-pressed", "true");
    await page.goBack();
    const card = page.locator(`.feed-grid > li[data-movie-id="${id}"]`);
    await expect(
      card.getByRole("button", { name: `More like this: ${title}` }),
    ).toHaveAttribute("aria-pressed", "true");

    // Hide and Undo on the page: the pick is back in the kept list.
    await card.locator("h3 a").click();
    await expect(page).toHaveURL(`/movie/${id}`);
    await detail
      .getByRole("button", { name: `Not interested in ${title}` })
      .click();
    await detail.getByRole("button", { name: `Undo hiding ${title}` }).click();
    await expect(
      detail.getByRole("button", { name: `Not interested in ${title}` }),
    ).toBeFocused();
    await page.goBack();
    await expect(
      page.locator(`.feed-grid > li[data-movie-id="${id}"]`),
    ).toHaveCount(1);

    // Hide on the feed, open another card, come back: left out, no Hidden line.
    const first = await firstCard(page);
    await first.item
      .getByRole("button", { name: `Not interested in ${first.title}` })
      .click();
    await expect(first.item).toContainText("Hidden from your picks.");
    const other = items(page).nth(2);
    const otherId = Number(await other.getAttribute("data-movie-id"));
    await other.locator("h3 a").click();
    await expect(page).toHaveURL(`/movie/${otherId}`);
    await page.goBack();
    await expect(items(page).first()).toBeVisible();
    await expect(
      page.locator(`.feed-grid > li[data-movie-id="${first.id}"]`),
    ).toHaveCount(0);
    await expect(page.getByText("Hidden from your picks.")).toHaveCount(0);
  });

  test("a movie the user rated shows no feedback controls", async ({
    page,
    request,
  }) => {
    const account = await openFeed(page, request, "fb-rated");
    const rated = await onServerDb(
      `select r.movie_id from ratings r join "user" u on u.id = r.user_id
       where u.email = $1 order by r.movie_id limit 1`,
      [account.email],
    );

    await page.goto(`/movie/${Number(rated.rows[0].movie_id)}`);

    await expect(page.locator('[data-slot="movie-detail"] h1')).toBeVisible({
      timeout: COLD_START_MS,
    });
    await expect(page.locator('[data-slot="feedback-controls"]')).toHaveCount(
      0,
    );
  });
});

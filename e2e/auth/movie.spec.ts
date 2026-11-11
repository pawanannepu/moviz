import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page, Request } from "@playwright/test";
import { Pool } from "pg";
import {
  type Account,
  createVerifiedAccount,
  deleteAccountQuietly,
  rateEmbeddedMoviesInDb,
  signInViaForm,
} from "../support/auth";
import { expect, test } from "../support/unique-ip";

// Spec 0010: the movie detail page and the feed that keeps its place. Runs
// with `playwright.auth.config.ts`, and needs a catalog with listable movies
// and embeddings (`pnpm embed:catalog`) on the database the server uses.
test.skip(
  !process.env.E2E_AUTH,
  "Run with: pnpm exec playwright test -c playwright.auth.config.ts",
);

/** The first request after a quiet spell opens a database connection, which can take a few seconds. */
const COLD_START_MS = 20_000;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
/** An id of the right shape that no catalog holds. */
const UNKNOWN_ID = "999999999999999";

const made: Account[] = [];

test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({
    baseURL: "http://localhost:3101",
  });
  for (const account of made) await deleteAccountQuietly(request, account);
  await request.dispose();
});

const items = (page: Page) => page.locator(".feed-grid > li");
const loadMore = (page: Page) =>
  page.getByRole("button", { name: "Load more picks" });
const backToPicks = (page: Page) =>
  page.getByRole("link", { name: "Back to picks" });
const detail = (page: Page) => page.locator('[data-slot="movie-detail"]');
const reasonBar = (page: Page) =>
  detail(page).locator('[data-slot="subtitle-bar"]');

/** A finished account with `liked` liked ratings, signed in on `/home` with the first batch showing. */
async function openFeed(
  page: Page,
  request: APIRequestContext,
  tag: string,
  liked = 5,
) {
  const account = await createVerifiedAccount(request, tag);
  made.push(account);
  if (liked > 0) await rateEmbeddedMoviesInDb(account.email, liked, 9);
  await signInViaForm(page, account.email);
  await expect(page).toHaveURL("/home", { timeout: COLD_START_MS });
  await expect(items(page).first()).toBeVisible({ timeout: COLD_START_MS });
  await waitForHydratedFeed(page);
  return account;
}

/** A click before React has hydrated a card is a full page load, so wait for it. */
async function waitForHydratedFeed(page: Page) {
  await page.waitForFunction(() => {
    const link = document.querySelector(".feed-grid > li a");
    return (
      link !== null &&
      Object.keys(link).some((key) => key.startsWith("__reactProps"))
    );
  });
}

const feedIds = (page: Page) =>
  items(page).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-movie-id")),
  );

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

/** The id of one movie this account has rated, read from the database the server uses. */
async function ratedMovieId(email: string): Promise<number> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No local env file (for example in CI). The real environment is used.
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      `select r.movie_id from ratings r
       join "user" u on u.id = r.user_id
       where u.email = $1 order by r.movie_id limit 1`,
      [email],
    );
    return Number(result.rows[0].movie_id);
  } finally {
    await pool.end();
  }
}

/** Requests that would mean the feed was loaded again: a `/home` render or a Server Action. */
function watchFeedLoads(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const isAction = request.headers()["next-action"] !== undefined;
    if (url.pathname === "/home" || isAction) seen.push(request);
  });
  return seen;
}

test.describe("the guards and the id check (AC-1, AC-2, AC-3, AC-19)", () => {
  test("a signed out visit goes to sign in and remembers the movie", async ({
    request,
  }) => {
    const response = await request.get("/movie/412", { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    const location = new URL(
      response.headers().location,
      "http://localhost:3101",
    );
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("returnTo")).toBe("/movie/412");
  });

  test("a bad id is a real 404 with the not found page, and an unknown id shows the same page", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "movie-404", 0);

    for (const bad of ["0", "012", "abc", "1.5", "-3"]) {
      const response = await page.goto(`/movie/${bad}`);
      expect(response?.status(), `/movie/${bad}`).toBe(404);
      await expect(
        page.getByRole("heading", { level: 1, name: "Movie not found" }),
      ).toBeVisible();
      await expect(page).toHaveTitle("Movie not found · Moviz");
    }

    await page.goto(`/movie/${UNKNOWN_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Movie not found" }),
    ).toBeVisible();
    await expect(
      page.getByText("This movie is not in Moviz. It may have been removed."),
    ).toBeVisible();
    await expect(page).toHaveTitle("Movie not found · Moviz");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Moviz" })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations,
    ).toEqual([]);

    // The link is a plain link: it navigates to the feed.
    await backToPicks(page).click();
    await expect(page).toHaveURL("/home");
  });

  test("a user who has not finished onboarding can open a movie page", async ({
    page,
    request,
  }) => {
    const account = await createVerifiedAccount(request, "movie-gate", {
      onboarded: false,
    });
    made.push(account);
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/onboarding", { timeout: COLD_START_MS });

    await page.goto(`/movie/${UNKNOWN_ID}`);
    await expect(page).toHaveURL(`/movie/${UNKNOWN_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Movie not found" }),
    ).toBeVisible();
  });
});

test.describe("the page (AC-4 to AC-8, AC-11, AC-12, AC-18, AC-19)", () => {
  test("a feed card opens its movie, with the same reason the card showed", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "movie-open");
    const card = items(page).first();
    const id = await card.getAttribute("data-movie-id");
    const title = (await card.getByRole("link").textContent()) ?? "";
    const reason =
      (await card.locator('[data-slot="subtitle-bar"]').textContent()) ?? "";
    expect(reason).toMatch(/^Because you /);

    // The keyboard path: the card's link has focus, and Enter opens it.
    await card.getByRole("link").focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(`/movie/${id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: title, exact: true }),
    ).toBeVisible({ timeout: COLD_START_MS });
    await expect(reasonBar(page)).toHaveText(reason);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page).toHaveTitle(/ · Moviz$/);
    expect(await page.title()).toContain(title);
    await expect(
      detail(page).getByRole("img", { name: `Poster for ${title}` }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );

    // The cast is a real list of at most 8 rows.
    const cast = detail(page).locator('[data-slot="movie-cast"] > li');
    expect(await cast.count()).toBeLessThanOrEqual(8);

    expect(
      (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations,
    ).toEqual([]);

    // Tab order follows visual order, and the back link is a 44px target.
    const box = await backToPicks(page).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);

    // Nothing about the reason is in the address.
    expect(page.url()).not.toContain("Because");
  });

  test("one column on a phone, two from 1024px, and no sideways scroll at any width", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "movie-layout");
    const id = await items(page).first().getAttribute("data-movie-id");
    await page.goto(`/movie/${id}`);
    await expect(detail(page)).toBeVisible({ timeout: COLD_START_MS });
    const poster = detail(page).locator("> div").first();
    const heading = page.locator("h1");

    for (const width of [320, 360, 768, 1023, 1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await horizontalOverflow(page), `width ${width}`).toBe(0);
      const posterBox = await poster.boundingBox();
      const headingBox = await heading.boundingBox();
      if (!posterBox || !headingBox) throw new Error("no layout box");
      expect(posterBox.width, `width ${width}`).toBeLessThanOrEqual(420);
      if (width < 1024) {
        // One column: the title starts below the poster.
        expect(headingBox.y).toBeGreaterThan(posterBox.y + posterBox.height);
      } else {
        // Two columns: the title sits beside the poster.
        expect(headingBox.x).toBeGreaterThan(posterBox.x + posterBox.width);
        expect(headingBox.y).toBeLessThan(posterBox.y + posterBox.height);
      }
    }

    expect(
      (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations,
    ).toEqual([]);
  });

  test("a movie the user already rated shows with no reason bar", async ({
    page,
    request,
  }) => {
    const account = await openFeed(page, request, "movie-rated");
    const id = await ratedMovieId(account.email);

    await page.goto(`/movie/${id}`);

    await expect(detail(page)).toBeVisible({ timeout: COLD_START_MS });
    await expect(detail(page)).toBeVisible();
    await expect(reasonBar(page)).toHaveCount(0);
    expect(
      (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations,
    ).toEqual([]);
  });
});

test.describe("the feed keeps its place (AC-13, AC-14, AC-15)", () => {
  test("after two loads, opening a card and going back shows the same picks with focus on that card, and loads nothing", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "movie-keep");
    await loadMore(page).click();
    await expect(items(page)).toHaveCount(48, { timeout: COLD_START_MS });
    await loadMore(page).click();
    await expect(items(page)).toHaveCount(72, { timeout: COLD_START_MS });
    const before = await feedIds(page);
    const opened = before[60];
    const card = page.locator(`.feed-grid > li[data-movie-id="${opened}"]`);

    await card.getByRole("link").click();
    await expect(page).toHaveURL(`/movie/${opened}`);
    await expect(detail(page)).toBeVisible({ timeout: COLD_START_MS });

    const loads = watchFeedLoads(page);
    await page.goBack();

    await expect(page).toHaveURL("/home");
    await expect(items(page)).toHaveCount(72);
    expect(await feedIds(page)).toEqual(before);
    await expect(card.getByRole("link")).toBeFocused();
    await expect(card).toBeInViewport();
    await expect(loadMore(page)).toBeVisible();
    expect(loads.map((r) => `${r.method()} ${r.url()}`)).toEqual([]);

    // The kept list never leaves memory.
    expect(
      await page.evaluate(() => [localStorage.length, sessionStorage.length]),
    ).toEqual([0, 0]);

    // A reload starts again at the top of the ranking.
    await page.reload();
    await expect(items(page).first()).toBeVisible({ timeout: COLD_START_MS });
    await expect(items(page)).toHaveCount(24);
  });

  test("Back to picks steps back in history after a card, and navigates on a direct visit", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "movie-back");
    await loadMore(page).click();
    await expect(items(page)).toHaveCount(48, { timeout: COLD_START_MS });
    const before = await feedIds(page);
    const opened = before[30];
    const card = page.locator(`.feed-grid > li[data-movie-id="${opened}"]`);

    await card.getByRole("link").click();
    await expect(page).toHaveURL(`/movie/${opened}`);
    await expect(detail(page)).toBeVisible({ timeout: COLD_START_MS });
    const loads = watchFeedLoads(page);
    await backToPicks(page).click();

    await expect(page).toHaveURL("/home");
    await expect(items(page)).toHaveCount(48);
    await expect(card.getByRole("link")).toBeFocused();
    expect(loads).toEqual([]);
    // It was a step back, so forward leads to the movie again.
    await page.goForward();
    await expect(page).toHaveURL(`/movie/${opened}`);

    // A direct visit: the same link is a plain link to the feed.
    await page.goto(`/movie/${opened}`);
    await expect(detail(page)).toBeVisible({ timeout: COLD_START_MS });
    await backToPicks(page).click();
    await expect(page).toHaveURL("/home");
    await expect(items(page).first()).toBeVisible({ timeout: COLD_START_MS });
    await expect(items(page)).toHaveCount(24);
  });

  test("a visit to another page in between makes Back to picks a plain link, and the kept list still shows", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "movie-between");
    await loadMore(page).click();
    await expect(items(page)).toHaveCount(48, { timeout: COLD_START_MS });
    const before = await feedIds(page);
    const opened = before[5];

    await page
      .locator(`.feed-grid > li[data-movie-id="${opened}"]`)
      .getByRole("link")
      .click();
    // Wait for the movie page itself: `/home` has an `h1` too.
    await expect(page).toHaveURL(`/movie/${opened}`);
    await expect(detail(page)).toBeVisible({ timeout: COLD_START_MS });
    await page.getByRole("link", { name: "Import" }).click();
    await expect(page).toHaveURL("/import");
    await page.goBack();
    await expect(page).toHaveURL(`/movie/${opened}`);
    await expect(detail(page)).toBeVisible({ timeout: COLD_START_MS });

    await backToPicks(page).click();

    await expect(page).toHaveURL("/home");
    await expect(items(page).first()).toBeVisible({ timeout: COLD_START_MS });
    // A new navigation (not a step back), and the kept list is shown again.
    await expect(items(page)).toHaveCount(48);
    expect(await feedIds(page)).toEqual(before);
    await page.goBack();
    await expect(page).toHaveURL(`/movie/${opened}`);
  });
});

test.describe("the design page (AC-20)", () => {
  test("shows every detail state with no accessibility violations", async ({
    page,
  }) => {
    await page.goto("/design");
    const section = page.locator(
      'section[aria-labelledby="movie-detail-title"]',
    );

    await expect(section.locator('[data-slot="movie-detail"]')).toHaveCount(4);
    await expect(
      section.locator('[data-slot="movie-detail-skeleton"]'),
    ).toHaveCount(1);
    await expect(section.locator('[data-slot="movie-not-found"]')).toHaveCount(
      1,
    );
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await horizontalOverflow(page), `width ${width}`).toBe(0);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include('section[aria-labelledby="movie-detail-title"]')
          .withTags(AXE_TAGS)
          .analyze()
      ).violations,
    ).toEqual([]);
  });
});

test.describe("keyboard and requests (AC-12, AC-15, AC-18)", () => {
  test("Tab reaches the skip link, the header and Back to picks in order, and the skip link moves focus to main", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "movie-tab");
    const id = await items(page).first().getAttribute("data-movie-id");
    await page.goto(`/movie/${id}`);
    await expect(detail(page)).toBeVisible({ timeout: COLD_START_MS });

    // What the page offers, in visual order: every link and button in `main`
    // down to the back link. The header may gain links; the order must hold.
    const offered = await page.evaluate(() => {
      const names = [...document.querySelectorAll("main a, main button")].map(
        (element) => element.textContent?.trim() ?? "",
      );
      return names.slice(0, names.indexOf("Back to picks") + 1);
    });
    expect(offered.slice(0, 1)).toEqual(["Moviz"]);
    expect(offered).toContain("Sign out");
    expect(offered.at(-1)).toBe("Back to picks");

    const stops: { name: string; height: number }[] = [];
    for (let step = 0; step < offered.length + 1; step++) {
      await page.keyboard.press("Tab");
      stops.push(
        await page.evaluate(() => {
          const element = document.activeElement as HTMLElement;
          return {
            name: element.textContent?.trim() ?? "",
            height: Math.round(element.getBoundingClientRect().height),
          };
        }),
      );
    }

    // Tab order follows visual order, with the skip link first.
    expect(stops.map((stop) => stop.name)).toEqual([
      "Skip to content",
      ...offered,
    ]);
    // Every target after the skip link is at least 44px high.
    for (const stop of stops.slice(1)) {
      expect(stop.height, stop.name).toBeGreaterThanOrEqual(44);
    }
    await page.reload();
    await expect(detail(page)).toBeVisible({ timeout: COLD_START_MS });
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main-content")).toBeFocused();
  });

  test("scrolling and hovering the feed asks for no movie page", async ({
    page,
    request,
  }) => {
    await openFeed(page, request, "movie-noprefetch");
    const asked: string[] = [];
    page.on("request", (sent) => {
      if (new URL(sent.url()).pathname.startsWith("/movie/")) {
        asked.push(sent.url());
      }
    });

    await items(page).last().scrollIntoViewIfNeeded();
    await items(page).nth(12).hover();
    await items(page).first().scrollIntoViewIfNeeded();
    await items(page).first().hover();
    await page.waitForLoadState("networkidle");

    expect(asked).toEqual([]);
  });
});

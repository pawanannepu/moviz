import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { Pool } from "pg";
import {
  type Account,
  createVerifiedAccount,
  deleteAccountQuietly,
  signInViaForm,
} from "../support/auth";
import { expect, test } from "../support/unique-ip";

// Spec 0013: where to watch on the movie page. Runs with
// `playwright.auth.config.ts`. Each test makes its own movie and seeds a fresh
// `watch_availability` row for it, so the page never calls TMDB and the result
// does not depend on TMDB's data or on a token. The fetch path, the 404 row and
// the stale and unavailable rules are covered by the database tests in
// `src/watch/load-availability.test.ts` with a fake TMDB.
test.skip(
  !process.env.E2E_AUTH,
  "Run with: pnpm exec playwright test -c playwright.auth.config.ts",
);

/** The first request after a quiet spell opens a database connection, which can take a few seconds. */
const COLD_START_MS = 20_000;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

try {
  process.loadEnvFile(".env.local");
} catch {
  // No local env file (for example in CI). The real environment is used.
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const accounts: Account[] = [];
const movieIds: number[] = [];

test.afterAll(async ({ playwright }) => {
  if (movieIds.length > 0) {
    // The availability rows go with their movies (AC-11).
    await pool.query("delete from movies where id = any($1::bigint[])", [
      movieIds,
    ]);
  }
  const request = await playwright.request.newContext({
    baseURL: "http://localhost:3101",
  });
  for (const account of accounts) await deleteAccountQuietly(request, account);
  await request.dispose();
  await pool.end();
});

type Offer = {
  type: "flatrate" | "free" | "ads" | "rent" | "buy";
  providerId: number;
  name: string;
  logoPath: string | null;
  priority: number;
};

const US_OFFERS: Offer[] = [
  {
    type: "flatrate",
    providerId: 8,
    name: "Netflix",
    logoPath: "/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg",
    priority: 0,
  },
  {
    type: "ads",
    providerId: 300,
    name: "Pluto TV",
    logoPath: null,
    priority: 4,
  },
  {
    type: "rent",
    providerId: 2,
    name: "Apple TV",
    logoPath: null,
    priority: 1,
  },
  { type: "buy", providerId: 2, name: "Apple TV", logoPath: null, priority: 1 },
];
const FR_OFFERS: Offer[] = [
  {
    type: "flatrate",
    providerId: 381,
    name: "Canal+",
    logoPath: null,
    priority: 1,
  },
];

/** A movie of our own, with a fresh row for the US and France, and none for Germany. */
async function movieWithOffers(title: string): Promise<number> {
  const { rows } = await pool.query(
    `insert into movies (title, title_normalized, overview)
     values ($1, lower($1), 'A movie made by the where to watch spec.') returning id`,
    [title],
  );
  const movieId = Number(rows[0].id);
  movieIds.push(movieId);
  const regions = {
    US: {
      link: "https://www.themoviedb.org/movie/949/watch?locale=US",
      offers: US_OFFERS,
    },
    FR: { link: null, offers: FR_OFFERS },
  };
  await pool.query(
    "insert into watch_availability (movie_id, regions, fetched_at) values ($1, $2, now())",
    [movieId, JSON.stringify(regions)],
  );
  return movieId;
}

/** Signs a fresh account in, with every movie page request carrying `ipCountry`. */
async function signIn(
  page: Page,
  request: Parameters<typeof createVerifiedAccount>[0],
  tag: string,
  ipCountry: string | null,
) {
  const account = await createVerifiedAccount(request, tag);
  accounts.push(account);
  if (ipCountry !== null) {
    await page.route("**/movie/**", (route) =>
      route.continue({
        headers: {
          ...route.request().headers(),
          "x-vercel-ip-country": ipCountry,
        },
      }),
    );
  }
  await signInViaForm(page, account.email);
  await expect(page).toHaveURL(/\/home$/, { timeout: COLD_START_MS });
  return account;
}

async function storedCountry(email: string) {
  const { rows } = await pool.query(
    `select p.country, p.country_source as source from profiles p
     join "user" u on u.id = p.user_id where u.email = $1`,
    [email],
  );
  return rows[0] as { country: string | null; source: string | null };
}

const section = (page: Page) => page.locator('[data-slot="where-to-watch"]');
const countryLine = (page: Page) => page.locator("#where-to-watch-country");

async function expectAccessible(page: Page) {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const results = await new AxeBuilder({ page })
      .include('[data-slot="where-to-watch"]')
      .withTags(AXE_TAGS)
      .analyze();
    expect(results.violations, `axe at ${width}px`).toEqual([]);
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(sideways, `sideways scroll at ${width}px`).toBe(false);
  }
}

test.describe("where to watch", () => {
  test("shows the services for the IP country, grouped, with the TMDB link and the credit (AC-1 to AC-5, AC-12)", async ({
    page,
    request,
  }) => {
    const movieId = await movieWithOffers("Zz Where To Watch Offers");
    const account = await signIn(page, request, "watch-offers", "us");

    await page.goto(`/movie/${movieId}`);

    await expect(section(page)).toBeVisible({ timeout: COLD_START_MS });
    await expect(
      page.getByRole("heading", { level: 2, name: "Where to watch" }),
    ).toBeVisible();
    await expect(countryLine(page)).toHaveText("In United States");
    await expect(section(page).locator("h3")).toHaveText([
      "Stream",
      "Free",
      "Rent",
      "Buy",
    ]);
    await expect(
      section(page).getByRole("list", { name: "Free" }).getByRole("listitem"),
    ).toHaveText(["Pluto TV"]);
    await expect(section(page).locator("li img")).toHaveAttribute("alt", "");
    await expect(section(page).locator("li a")).toHaveCount(0);
    const tmdb = section(page).getByRole("link", {
      name: "See all options on TMDB",
    });
    await expect(tmdb).toHaveAttribute(
      "href",
      "https://www.themoviedb.org/movie/949/watch?locale=US",
    );
    await expect(tmdb).not.toHaveAttribute("target", /.*/);
    await expect(
      section(page).getByRole("link", { name: "JustWatch" }),
    ).toHaveAttribute("href", "https://www.justwatch.com");
    expect(await storedCountry(account.email)).toEqual({
      country: "US",
      source: "ip",
    });
    await expectAccessible(page);
  });

  test("shows Not found on streaming, with the credit, for a country with no offers (AC-3, AC-4, AC-12)", async ({
    page,
    request,
  }) => {
    const movieId = await movieWithOffers("Zz Where To Watch Empty");
    await signIn(page, request, "watch-empty", "de");

    await page.goto(`/movie/${movieId}`);

    await expect(
      section(page).getByText("Not found on streaming in Germany."),
    ).toBeVisible({ timeout: COLD_START_MS });
    await expect(section(page).getByText("Streaming data from")).toBeVisible();
    await expect(
      section(page).getByRole("link", { name: "See all options on TMDB" }),
    ).toHaveCount(0);
    await expectAccessible(page);
  });

  test("asks for a country when the IP header is not a watch region, and saves one (AC-5, AC-6, AC-10, AC-12)", async ({
    page,
    request,
  }) => {
    const movieId = await movieWithOffers("Zz Where To Watch No Country");
    const account = await signIn(page, request, "watch-none", "T1");

    await page.goto(`/movie/${movieId}`);

    await expect(countryLine(page)).toHaveText(
      "Choose your country to see where to watch.",
      { timeout: COLD_START_MS },
    );
    await expect(section(page).getByRole("list")).toHaveCount(0);
    await expect(
      section(page).getByRole("button", { name: "Cancel" }),
    ).toHaveCount(0);
    expect(await storedCountry(account.email)).toEqual({
      country: null,
      source: null,
    });
    await expectAccessible(page);

    await section(page)
      .getByLabel("Country", { exact: true })
      .selectOption("FR");
    await section(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();

    await expect(countryLine(page)).toHaveText("In France", {
      timeout: COLD_START_MS,
    });
    await expect(countryLine(page)).toBeFocused();
    await expect(
      section(page).getByRole("list", { name: "Stream" }),
    ).toHaveText("Canal+");
    expect(await storedCountry(account.email)).toEqual({
      country: "FR",
      source: "user",
    });
  });

  test("changes the country with the keyboard only, and the choice beats the IP header (AC-5, AC-6)", async ({
    page,
    request,
  }) => {
    const movieId = await movieWithOffers("Zz Where To Watch Keyboard");
    const account = await signIn(page, request, "watch-keys", "us");
    await page.goto(`/movie/${movieId}`);
    await expect(countryLine(page)).toHaveText("In United States", {
      timeout: COLD_START_MS,
    });

    const toggle = section(page).getByRole("button", {
      name: "Change country",
    });
    await toggle.focus();
    await page.keyboard.press("Enter");
    const select = section(page).getByLabel("Country", { exact: true });
    await expect(select).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();

    await page.keyboard.press("Enter");
    await select.selectOption("FR");
    await page.keyboard.press("Tab");
    await expect(
      section(page).getByRole("button", { name: "Save", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(countryLine(page)).toHaveText("In France", {
      timeout: COLD_START_MS,
    });
    await expect(countryLine(page)).toBeFocused();

    await page.reload();
    await expect(countryLine(page)).toHaveText("In France", {
      timeout: COLD_START_MS,
    });
    expect(await storedCountry(account.email)).toEqual({
      country: "FR",
      source: "user",
    });
  });

  test("names every country in English, sorted by name (AC-6)", async ({
    page,
    request,
  }) => {
    const movieId = await movieWithOffers("Zz Where To Watch Names");
    await signIn(page, request, "watch-names", "us");
    await page.goto(`/movie/${movieId}`);
    await section(page)
      .getByRole("button", { name: "Change country" })
      .click({ timeout: COLD_START_MS });

    const names = await section(page)
      .getByLabel("Country", { exact: true })
      .locator("option")
      .allTextContents();

    expect(names.length).toBeGreaterThan(100);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    expect(names).toContain("Kosovo");
    expect(names).toContain("Côte d’Ivoire");
  });

  test("tells a user whose session ended to sign in again when the save fails (AC-10)", async ({
    page,
    request,
  }) => {
    const movieId = await movieWithOffers("Zz Where To Watch Session");
    const account = await signIn(page, request, "watch-session", "us");
    await page.goto(`/movie/${movieId}`);
    await section(page)
      .getByRole("button", { name: "Change country" })
      .click({ timeout: COLD_START_MS });
    await section(page)
      .getByLabel("Country", { exact: true })
      .selectOption("FR");
    // The session ends on the server while the cookie stays, as when it
    // expires or is revoked. Without a cookie the route guard would redirect
    // before the action runs.
    await pool.query(
      `delete from session where user_id = (select id from "user" where email = $1)`,
      [account.email],
    );

    await section(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();

    const alert = section(page).getByRole("alert");
    await expect(alert).toContainText("Your session ended.");
    await expect(
      alert.getByRole("link", { name: "Sign in again" }),
    ).toHaveAttribute("href", `/sign-in?returnTo=%2Fmovie%2F${movieId}`);
  });
});

import { test as base } from "@playwright/test";

let counter = 0;

/**
 * A client address no other test in this run uses (spec 0005, AC-11). Better
 * Auth's rate limits are per IP and stored in Postgres, so tests that share an
 * address would use up each other's allowance. Uses the 10.x.x.x private range.
 */
export function uniqueClientIp(workerIndex: number): string {
  counter += 1;
  const seed = Date.now() % 65_536;
  const third = (seed + workerIndex) % 256;
  const fourth = (counter + Math.floor(seed / 256)) % 254;
  return `10.${(workerIndex % 250) + 1}.${third}.${fourth + 1}`;
}

/**
 * Playwright's `test`, with one change: every request this test's page makes to
 * `/api/auth/` carries its own `X-Forwarded-For`. Only that path is touched, so
 * calls to other sites (Cloudflare's Turnstile script) are left alone. Import
 * `test` from here in every spec that signs up, signs in or resets a password.
 */
export const test = base.extend<{ clientIp: string }>({
  // Playwright needs an object pattern here, so a built in fixture is named.
  clientIp: async ({ baseURL: _baseURL }, use, testInfo) => {
    await use(uniqueClientIp(testInfo.workerIndex));
  },
  page: async ({ page, clientIp }, use) => {
    await page.route("**/api/auth/**", (route) =>
      route.continue({
        headers: { ...route.request().headers(), "x-forwarded-for": clientIp },
      }),
    );
    await use(page);
  },
});

export { expect } from "@playwright/test";

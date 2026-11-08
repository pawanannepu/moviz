import { expect, test } from "@playwright/test";

// Spec 0004, AC-17: the /design page is hidden in production. Run with
// `pnpm test:e2e:production`, which builds the app and starts it with
// VERCEL_ENV=production.
test.describe("production build", () => {
  test("returns 404 for /design", async ({ request }) => {
    const response = await request.get("/design");

    expect(response.status()).toBe(404);
  });

  test("still serves the landing page", async ({ request }) => {
    const response = await request.get("/");

    expect(response.status()).toBe(200);
  });
});

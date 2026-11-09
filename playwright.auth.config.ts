import { defineConfig, devices } from "@playwright/test";
import { AUTH_BASE, AUTH_PORT, AUTH_SERVER_LOG } from "./e2e/support/auth";

// Email sign in specs (spec 0005, e2e/auth/). They run against a production
// build on their own port with Cloudflare's always pass Turnstile test keys,
// so they work even when .env.local holds a real key (a headless browser cannot
// pass a real challenge). The server prints each email to a log file, and the
// tests read their links from it. Run: pnpm exec playwright test -c playwright.auth.config.ts
process.env.E2E_AUTH = "1";

export default defineConfig({
  testDir: "./e2e/auth",
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 90_000,
  use: {
    baseURL: AUTH_BASE,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `sh -c ': > "${AUTH_SERVER_LOG}" && pnpm build && pnpm exec next start -p ${AUTH_PORT} >> "${AUTH_SERVER_LOG}" 2>&1'`,
    url: `${AUTH_BASE}/sign-in`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      BETTER_AUTH_URL: AUTH_BASE,
    },
  },
});

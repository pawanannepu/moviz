import { defineConfig, devices } from "@playwright/test";

const port = 3100;

/**
 * A production build, started with `VERCEL_ENV=production`, to prove the
 * /design page is hidden there (spec 0004, AC-17). Slower than the main config
 * because it builds first. Run with `pnpm test:e2e:production`.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "design-production.spec.ts",
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${port}`,
    env: { VERCEL_ENV: "production" },
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});

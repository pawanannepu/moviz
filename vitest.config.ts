import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Playwright owns e2e/. Keep the two runners apart.
    exclude: ["node_modules", ".next", "e2e"],
    // No suite exists yet. Features add tests as they land.
    passWithNoTests: true,
  },
});

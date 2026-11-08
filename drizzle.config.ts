import { defineConfig } from "drizzle-kit";

// drizzle-kit does not load .env files, so read .env.local the way Next.js does.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on variables already in the environment (CI, Vercel).
}

// `generate` works offline. `migrate` and `push` need the direct connection.
const url = process.env.DATABASE_URL_UNPOOLED;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  ...(url ? { dbCredentials: { url } } : {}),
});

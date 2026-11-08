import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";

/**
 * Minimal Better Auth config. For now it only exists so the Better Auth CLI
 * can read it and generate `src/db/auth-schema.ts`. Feature 6 (email sign in)
 * owns this file from here: sessions, email sending, the account delete hook.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  // The default in memory store does nothing on serverless.
  rateLimit: { enabled: true, storage: "database" },
});

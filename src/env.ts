import { z } from "zod";

/**
 * The one place `process.env` is read. Server only: never import this from a
 * client component. Each feature adds its own names here and to `.env.example`.
 */
const envSchema = z.object({
  /** Neon pooled connection string, used by the running app. */
  DATABASE_URL: z.url(),
  /** Neon direct connection string, used by `drizzle-kit` migrations. */
  DATABASE_URL_UNPOOLED: z.url().optional(),
  /** Neon test branch, reset per test run. */
  DATABASE_URL_TEST: z.url().optional(),
  /** Better Auth encryption secret (min 32 chars). Feature 6 makes it required. */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  /** Public base URL of the app. Feature 6 makes it required. */
  BETTER_AUTH_URL: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses an environment record. Pure: the caller decides where the record
 * comes from. Returns the names that failed, never their values.
 */
export function parseEnv(
  source: Record<string, string | undefined>,
): { ok: true; env: Env } | { ok: false; invalid: string[] } {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return { ok: true, env: parsed.data };
  const invalid = [
    ...new Set(parsed.error.issues.map((issue) => String(issue.path[0]))),
  ];
  return { ok: false, invalid };
}

function loadEnv(): Env {
  const result = parseEnv(process.env);
  if (!result.ok) {
    throw new Error(
      `Invalid or missing environment variables: ${result.invalid.join(", ")}. See .env.example.`,
    );
  }
  return result.env;
}

/** Validated environment. Throws at first import if a name is missing or malformed. */
export const env: Env = loadEnv();

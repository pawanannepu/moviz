import { z } from "zod";

/**
 * The one place `process.env` is read. Server only: never import this from a
 * client component. Each feature adds its own names here and to `.env.example`.
 */
/** A key that may be absent. A blank value (`NAME=`) counts as absent. */
const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

/** A URL that may be absent. A blank value (`NAME=`) counts as absent. */
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

const envObject = z.object({
  /** Neon pooled connection string, used by the running app. */
  DATABASE_URL: z.url(),
  /** Neon direct connection string, used by `drizzle-kit` migrations. */
  DATABASE_URL_UNPOOLED: z.url().optional(),
  /** Neon test branch, reset per test run. */
  DATABASE_URL_TEST: z.url().optional(),
  /** Better Auth encryption secret (min 32 chars). Generate with `openssl rand -base64 32`. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /**
   * Public base URL of the app (spec 0005). Required, except on Vercel
   * previews, which build their own host from `VERCEL_URL`.
   */
  BETTER_AUTH_URL: optionalUrl,
  /** Host of this deployment. Set by Vercel, without a scheme. */
  VERCEL_URL: optionalSecret,
  /** Host of this branch's stable alias. Set by Vercel, without a scheme. */
  VERCEL_BRANCH_URL: optionalSecret,
  /** TMDB API Read Access Token. Catalog sync (spec 0003) checks it when it runs. */
  TMDB_API_TOKEN: optionalSecret,
  /** Voyage AI key for embeddings. Catalog embedding (spec 0003) checks it when it runs. */
  VOYAGE_API_KEY: optionalSecret,
  /** Bearer token Vercel sends to cron routes. The route fails closed when unset. */
  CRON_SECRET: optionalSecret,
  /** Set by Vercel (`production`, `preview` or `development`). Hides `/design` in production (spec 0004) and decides how email is sent (spec 0005). */
  VERCEL_ENV: optionalSecret,
  /** Resend API key. Optional in local development, where links print to the console. */
  RESEND_API_KEY: optionalSecret,
  /** Sender address for auth email, for example `Moviz <hello@your-domain>`. */
  EMAIL_FROM: optionalSecret,
  /**
   * Cloudflare Turnstile site key (spec 0005). Public by design: the server page
   * passes it to the widget as a prop. Local and CI use Cloudflare's always pass
   * test key `1x00000000000000000000AA`.
   */
  TURNSTILE_SITE_KEY: z.string().min(1),
  /**
   * Cloudflare Turnstile secret key. Server only. Local and CI use Cloudflare's
   * always pass test secret `1x0000000000000000000000000000000AA`.
   */
  TURNSTILE_SECRET_KEY: z.string().min(1),
});

const envSchema = envObject.superRefine((value, ctx) => {
  // A console fallback on Vercel would put tokens in hosted logs, so hosted
  // deployments must have a real sender (spec 0005, AC-14).
  if (value.VERCEL_ENV === "preview" || value.VERCEL_ENV === "production") {
    for (const name of ["RESEND_API_KEY", "EMAIL_FROM"] as const) {
      if (value[name] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: "required on Vercel",
        });
      }
    }
  }
  if (value.BETTER_AUTH_URL === undefined && value.VERCEL_ENV !== "preview") {
    ctx.addIssue({
      code: "custom",
      path: ["BETTER_AUTH_URL"],
      message: "required unless VERCEL_ENV is preview",
    });
  }
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

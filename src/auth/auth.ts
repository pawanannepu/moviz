import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { captcha } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db/client";
import { user as userTable } from "@/db/schema";
import { sendEmail } from "@/email/send";
import { resetPasswordContent, verifyEmailContent } from "@/email/templates";
import { env } from "@/env";
import { upsertProfile } from "@/profile/profile";
import { deleteAccount } from "@/user-data/delete-account";
import { handleExistingUserSignUp } from "./existing-user";
import { type AuthEventName, logAuthEvent } from "./log-auth-event";
import { nameFromEmail } from "./name-from-email";
import { RESET_PASSWORD_PATH, VERIFY_EMAIL_PATH } from "./paths";
import { withDerivedName } from "./sign-up-name";
import { pickSiteOrigin } from "./site-origin";
import { TERMS_VERSION } from "./terms";
import { withVerifyCallback } from "./verify-link";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const ONE_DAY = 60 * 60 * 24;

/** Hosts this deployment answers on. Exact names, no wildcards. */
function allowedHosts(): string[] {
  const hosts = [
    env.BETTER_AUTH_URL ? new URL(env.BETTER_AUTH_URL).host : undefined,
    env.VERCEL_URL,
    env.VERCEL_BRANCH_URL,
    // Local development only. Production never trusts a localhost origin.
    env.VERCEL_ENV === "production" ? undefined : "localhost:3000",
  ];
  return [...new Set(hosts.filter((host): host is string => !!host))];
}

/**
 * Hostnames Turnstile may report for a token. Only the production host is
 * pinned: previews, local and CI use Cloudflare's always pass test keys, which
 * report `example.com` (spec 0005, AC-11).
 */
function captchaHostnames(): string[] | undefined {
  if (env.VERCEL_ENV !== "production" || !env.BETTER_AUTH_URL) return undefined;
  return [new URL(env.BETTER_AUTH_URL).hostname];
}

/** Whether a host is served over plain http (local development only). */
function isLocalHost(host: string): boolean {
  return host === "localhost" || host.startsWith("localhost:");
}

/**
 * The exact origins Better Auth's origin check accepts. Route Handlers outside
 * Better Auth, such as the Letterboxd import, compare a request's `Origin`
 * header against this same list (spec 0009, AC-12).
 */
export function trustedOrigins(): string[] {
  return allowedHosts().map(
    (host) => `${isLocalHost(host) ? "http" : "https"}://${host}`,
  );
}

/**
 * Runs a send after the response is sent, so a slow mail provider does not change
 * response time (AC-14). Outside a request (tests, scripts) there is no
 * `after`, so the promise just runs on its own.
 */
function runAfterResponse(promise: Promise<unknown>): void {
  try {
    after(promise);
  } catch {
    void promise.catch(() => undefined);
  }
}

/** The outcome code for a finished auth call: `ok`, or the error's code. */
function outcomeOf(returned: unknown): { outcome: string; userId?: string } {
  if (returned instanceof APIError) {
    const body = returned.body as { code?: string } | undefined;
    return { outcome: (body?.code ?? "error").toLowerCase() };
  }
  const userId = (returned as { user?: { id?: unknown } } | null)?.user?.id;
  return {
    outcome: "ok",
    ...(typeof userId === "string" ? { userId } : {}),
  };
}

/**
 * The auth routes that get a log line (AC-16). Sign out has no user id: the
 * session is gone by the time this runs, and the line must not guess one. A
 * finished reset logs itself in `onPasswordReset`, where the user id is known;
 * the hook only logs a failed one.
 */
const EVENT_FOR_PATH: Record<string, AuthEventName | undefined> = {
  "/sign-up/email": "sign_up",
  "/sign-in/email": "sign_in",
  "/sign-out": "sign_out",
  "/request-password-reset": "reset_requested",
  "/reset-password": "reset_completed",
};

/**
 * A completed reset proves the person controls the inbox, so the email counts
 * as verified (AC-6). Without this, a stranger's unverified sign up could not
 * be taken over by the real owner. Never throws: the password has already
 * changed, and a failure here only means the next sign in asks to verify.
 */
async function markEmailVerified(userId: string): Promise<void> {
  try {
    await db
      .update(userTable)
      .set({ emailVerified: true })
      .where(eq(userTable.id, userId));
  } catch (error) {
    console.error(
      `[auth] mark verified failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  }
}

/**
 * The Better Auth server config (spec 0005). Email and password, a verified
 * email before any session, sessions read from the database on every check,
 * and a profile row for every new user. The browser forms call its
 * `/api/auth/*` routes, so its rate limits and bot check really run.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  baseURL: {
    allowedHosts: allowedHosts(),
    protocol: "auto",
    ...(env.BETTER_AUTH_URL ? { fallback: env.BETTER_AUTH_URL } : {}),
  },
  trustedOrigins: trustedOrigins(),
  // At `info` the library logs the email of a repeated sign up (AC-16).
  logger: { level: "warn" },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 15 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }): Promise<void> => {
      await sendEmail({ to: user.email, ...resetPasswordContent({ url }) });
    },
    onPasswordReset: async ({ user }): Promise<void> => {
      await markEmailVerified(user.id);
      logAuthEvent({
        event: "reset_completed",
        outcome: "ok",
        userId: user.id,
      });
    },
    onExistingUserSignUp: async ({ user }, request): Promise<void> => {
      await handleExistingUserSignUp(user, {
        origin: pickSiteOrigin({
          requestUrl: request?.url,
          allowedHosts: allowedHosts(),
          fallback: env.BETTER_AUTH_URL,
        }),
        send: sendEmail,
        // A direct server call: it skips the HTTP rate limit and bot check,
        // which already ran for the sign up request that brought us here.
        requestReset: (email) =>
          auth.api.requestPasswordReset({
            body: { email, redirectTo: RESET_PASSWORD_PATH },
          }),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: ONE_DAY,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        ...verifyEmailContent({
          url: withVerifyCallback(url, VERIFY_EMAIL_PATH),
        }),
      });
    },
    afterEmailVerification: async (user) => {
      logAuthEvent({ event: "email_verified", outcome: "ok", userId: user.id });
    },
  },
  // No `cookieCache`: every check reads the database, so a revoked session
  // stops working at once (AC-15). The cookie is HttpOnly and SameSite=Lax by
  // default; it is `Secure` on every hosted deployment.
  session: { expiresIn: THIRTY_DAYS, updateAge: ONE_DAY },
  advanced: {
    useSecureCookies: env.VERCEL_ENV !== undefined,
    backgroundTasks: { handler: runAfterResponse },
  },
  // The default in memory store does nothing on serverless. Per IP limits for
  // exactly these four routes (AC-11); every other route keeps the defaults.
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 1 },
    },
  },
  // The bot check covers sign up and reset requests only. The plugin's default
  // list also covers sign in, which is not wanted here (AC-11).
  plugins: [
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: env.TURNSTILE_SECRET_KEY,
      endpoints: ["/sign-up/email", "/request-password-reset"],
      allowedHostnames: captchaHostnames(),
    }),
  ],
  user: {
    // No screen ships here (spec 17 builds it). The route needs the current
    // password (see `hooks.before`), clears the user's token rows first, then
    // removes the user and everything it owns (AC-13).
    deleteUser: {
      enabled: true,
      beforeDelete: async (user): Promise<void> => {
        const result = await deleteAccount(db, { userId: user.id });
        // A user already gone is fine: the library only clears the cookie.
        if (!result.ok && result.error.code !== "user_not_found") {
          throw APIError.from("INTERNAL_SERVER_ERROR", {
            code: "DELETE_FAILED",
            message: "Could not delete the account",
          });
        }
      },
      afterDelete: async (user): Promise<void> => {
        logAuthEvent({
          event: "account_deleted",
          outcome: "ok",
          userId: user.id,
        });
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: { ...user, name: nameFromEmail(user.email) },
        }),
        after: async (user) => {
          // A user must never exist without terms fields (AC-12). If the
          // profile cannot be written, log without the address and throw;
          // `getProfile` later creates the row with the same terms.
          const result = await upsertProfile(db, {
            userId: user.id,
            termsVersion: TERMS_VERSION,
          }).catch((error: unknown) => {
            console.error(
              `[auth] profile create threw: ${error instanceof Error ? error.name : "unknown"}`,
            );
            throw error;
          });
          if (!result.ok) {
            console.error(`[auth] profile create failed: ${result.error.code}`);
            throw new Error(`profile create failed: ${result.error.code}`);
          }
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        // Same `name` for a new and an existing email (AC-7).
        const body = withDerivedName(ctx.body);
        return body ? { context: { body } } : undefined;
      }
      if (ctx.path !== "/delete-user") return;
      const password = (ctx.body as { password?: unknown } | undefined)
        ?.password;
      if (typeof password !== "string" || password === "") {
        throw APIError.from("BAD_REQUEST", {
          code: "PASSWORD_REQUIRED",
          message: "The current password is required",
        });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const event = EVENT_FOR_PATH[ctx.path];
      if (!event) return;
      const { outcome, userId } = outcomeOf(ctx.context.returned);
      // A successful reset is logged in `onPasswordReset`, with the user id.
      if (ctx.path === "/reset-password" && outcome === "ok") return;
      logAuthEvent({
        event,
        outcome,
        ...(userId ? { userId } : {}),
      });
    }),
  },
});

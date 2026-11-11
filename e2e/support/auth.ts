import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type APIRequestContext,
  type Browser,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { Pool } from "pg";
import { uniqueClientIp } from "./unique-ip";

/** The port the auth server listens on (see `playwright.auth.config.ts`). */
export const AUTH_PORT = 3101;
export const AUTH_BASE = `http://localhost:${AUTH_PORT}`;

/**
 * Where the auth server writes its output. Without a Resend key the server
 * prints each email, so reading this file is how a test "opens the inbox".
 */
export const AUTH_SERVER_LOG = join(tmpdir(), "moviz-auth-e2e-server.log");

/** A password that passes the 8 character rule. */
export const PASSWORD = "correct-horse-1";

/** Any value works with Cloudflare's always pass test secret. */
const TEST_CAPTCHA_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

export type Account = { email: string; password: string };

let emailCounter = 0;

/** An address no other test uses. Unverified rows are not cleaned up, so it ends in example.com. */
export function newEmail(tag: string): string {
  emailCounter += 1;
  const stamp = `${Date.now().toString(36)}${emailCounter}${Math.random().toString(36).slice(2, 6)}`;
  return `e2e-${tag}-${stamp}@example.com`;
}

/** A client address for this worker that no other call in the run has used. */
export function freshIp(): string {
  return uniqueClientIp(test.info().workerIndex);
}

/**
 * A second browser, like another device, that has its own client address.
 * `browser.newContext` skips the fixture in `unique-ip.ts`, so without this the
 * extra browser shares one address and runs into the sign in rate limit.
 */
export async function newDeviceContext(browser: Browser) {
  const ip = freshIp();
  const context = await browser.newContext({ baseURL: AUTH_BASE });
  await context.route("**/api/auth/**", (route) =>
    route.continue({
      headers: { ...route.request().headers(), "x-forwarded-for": ip },
    }),
  );
  return context;
}

/** The headers every direct API call needs: the origin check and its own rate limit bucket. */
export function apiHeaders(ip: string, extra: Record<string, string> = {}) {
  return {
    origin: AUTH_BASE,
    "content-type": "application/json",
    "x-forwarded-for": ip,
    ...extra,
  };
}

export type SentEmail = {
  to: string;
  subject: string;
  text: string;
  link: string | undefined;
};

/** Every email the server has printed for an address, oldest first. */
export function emailsTo(address: string): SentEmail[] {
  let log = "";
  try {
    log = readFileSync(AUTH_SERVER_LOG, "utf8");
  } catch {
    return [];
  }
  return log
    .split("[email] to: ")
    .slice(1)
    .filter((block) => block.startsWith(`${address}\n`))
    .map((block) => {
      const subject = block.match(/\[email\] subject: (.*)/)?.[1] ?? "";
      return {
        to: address,
        subject,
        text: block,
        link: block.match(/https?:\/\/[^\s]+/)?.[0],
      };
    });
}

/** Waits until `count` emails exist for an address and returns them all. */
export async function waitForEmails(
  address: string,
  count = 1,
): Promise<SentEmail[]> {
  await expect
    .poll(() => emailsTo(address).length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(count);
  return emailsTo(address);
}

/** The newest email for an address, waiting for the first one to arrive. */
export async function latestEmail(
  address: string,
  count = 1,
): Promise<SentEmail> {
  const all = await waitForEmails(address, count);
  return all[all.length - 1] as SentEmail;
}

/** The auth lines the server wrote (spec 0005, AC-16), as parsed objects. */
export function authLogLines(): Record<string, unknown>[] {
  let log = "";
  try {
    log = readFileSync(AUTH_SERVER_LOG, "utf8");
  } catch {
    return [];
  }
  return log
    .split("\n")
    .filter((line) => line.startsWith('{"type":"auth"'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** The Turnstile test widget needs a few seconds to hand out its token. */
export async function waitForTurnstileToken(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const field = document.querySelector<HTMLInputElement>(
        'input[name="cf-turnstile-response"]',
      );
      return Boolean(field?.value);
    },
    undefined,
    { timeout: 30_000 },
  );
}

/** Fills the sign up form and submits it once the bot check has a token. */
export async function signUpViaForm(
  page: Page,
  email: string,
  password = PASSWORD,
): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").first().fill(password);
  await waitForTurnstileToken(page);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox" }),
  ).toBeVisible();
}

/** Signs in through the form. The caller asserts what happens next. */
export async function signInViaForm(
  page: Page,
  email: string,
  password = PASSWORD,
  from = "/sign-in",
): Promise<void> {
  await page.goto(from);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").first().fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Creates an account straight through the API (the test token passes the bot check). */
export async function signUpViaApi(
  request: APIRequestContext,
  email: string,
  password = PASSWORD,
): Promise<void> {
  const response = await request.post("/api/auth/sign-up/email", {
    headers: apiHeaders(freshIp(), {
      "x-captcha-response": TEST_CAPTCHA_TOKEN,
    }),
    data: { email, password, name: "x", callbackURL: "/verify-email" },
  });
  expect(response.status()).toBe(200);
}

/** Opens the verification link from the newest email, without following the redirect. */
export async function verifyViaApi(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const mail = await latestEmail(email);
  const response = await request.get(mail.link as string, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
}

/**
 * Marks an account as having finished onboarding (spec 0006), straight in the
 * database the server uses. Without it, signing in lands on `/onboarding`
 * instead of `/home`, which the auth specs are not about.
 */
export async function markOnboardedInDb(email: string): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No local env file (for example in CI). The real environment is used.
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      `update profiles set onboarded_at = coalesce(onboarded_at, now())
       where user_id = (select id from "user" where email = $1)`,
      [email],
    );
    expect(result.rowCount, "the account must have a profile row").toBe(1);
  } finally {
    await pool.end();
  }
}

/**
 * Gives an account `count` ratings of `score` on the most voted movies that
 * have an embedding, straight in the database the server uses. A liked score
 * (6 or more) gives the feed a taste signal; fewer than 5 liked makes it
 * `thin` (spec 0008). Needs `pnpm embed:catalog` to have run on that database.
 */
export async function rateEmbeddedMoviesInDb(
  email: string,
  count: number,
  score: number,
): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No local env file (for example in CI). The real environment is used.
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      `insert into ratings (user_id, movie_id, score, source)
       select u.id, m.id, $2, 'manual'
       from "user" u,
         lateral (
           select m.id from movies m
           join movie_embeddings e on e.movie_id = m.id
           order by m.vote_count desc nulls last, m.id
           limit $3
         ) m
       where u.email = $1
       on conflict do nothing`,
      [email, score, count],
    );
    expect(result.rowCount, "the catalog needs embedded movies").toBe(count);
  } finally {
    await pool.end();
  }
}

/**
 * A verified account, made through the API so a test does not repeat the sign
 * up flow. It has finished onboarding unless `onboarded` is false, so signing
 * in lands on `/home`.
 */
export async function createVerifiedAccount(
  request: APIRequestContext,
  tag: string,
  options: { onboarded?: boolean } = {},
): Promise<Account> {
  const email = newEmail(tag);
  await signUpViaApi(request, email);
  await verifyViaApi(request, email);
  if (options.onboarded !== false) await markOnboardedInDb(email);
  return { email, password: PASSWORD };
}

/** Removes an account the test made, through the real delete route. Never fails a test. */
export async function deleteAccountQuietly(
  request: APIRequestContext,
  account: Account,
): Promise<void> {
  try {
    const ip = freshIp();
    const signedIn = await request.post("/api/auth/sign-in/email", {
      headers: apiHeaders(ip),
      data: { email: account.email, password: account.password },
    });
    if (signedIn.status() !== 200) return;
    await request.post("/api/auth/delete-user", {
      headers: apiHeaders(ip),
      data: { password: account.password },
    });
  } catch {
    // Clean up is best effort.
  }
}

/** The session cookie the browser holds, or undefined. */
export async function sessionCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name.endsWith("session_token"));
}

/** The form's own error message. Next also keeps an empty `role="alert"` route announcer on every page. */
export function formAlert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

/**
 * Presses Sign out and waits for the landing page. A click before the page has
 * hydrated does nothing, so the press is retried until the browser has moved.
 */
export async function signOutViaButton(page: Page): Promise<void> {
  await expect(async () => {
    if (new URL(page.url()).pathname === "/") return;
    await page
      .getByRole("button", { name: "Sign out" })
      .click({ timeout: 2000 });
    await expect(page).toHaveURL("/", { timeout: 4000 });
  }).toPass({ timeout: 30_000 });
}

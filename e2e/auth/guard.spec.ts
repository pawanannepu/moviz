import {
  type Account,
  AUTH_BASE,
  apiHeaders,
  createVerifiedAccount,
  deleteAccountQuietly,
  freshIp,
  sessionCookie,
  signInViaForm,
  signOutViaButton,
} from "../support/auth";
import { expect, test } from "../support/unique-ip";

// Spec 0005: the default deny route guard and real session checks (AC-5, AC-8).
test.skip(
  !process.env.E2E_AUTH,
  "Run with: pnpm exec playwright test -c playwright.auth.config.ts",
);

test.describe("signed out (AC-8)", () => {
  test("a protected page redirects to sign in and remembers where the person was going", async ({
    request,
  }) => {
    const response = await request.get("/home", { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(/\/sign-in\?returnTo=%2Fhome$/);
  });

  test("a protected API path answers 401 JSON instead of redirecting", async ({
    request,
  }) => {
    const response = await request.get("/api/anything", { maxRedirects: 0 });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  test("a forged session cookie passes the proxy but is turned away by the page check, and public pages still open", async ({
    request,
  }) => {
    const cookie = { cookie: "better-auth.session_token=forged.value" };

    const home = await request.get("/home", {
      headers: cookie,
      maxRedirects: 0,
    });
    const signIn = await request.get("/sign-in", {
      headers: cookie,
      maxRedirects: 0,
    });

    expect(home.status()).toBe(307);
    expect(home.headers().location).toContain("/sign-in");
    expect(signIn.status()).toBe(200);
  });

  test("the public pages and the TMDB logo open without a session", async ({
    request,
  }) => {
    for (const path of [
      "/",
      "/sign-in",
      "/sign-up",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/tmdb-logo.svg",
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
    }
  });

  test("the auth API stays reachable so people can sign in", async ({
    request,
  }) => {
    const response = await request.get("/api/auth/get-session", {
      headers: apiHeaders(freshIp()),
    });

    expect(response.status()).toBe(200);
  });
});

test.describe("signed in", () => {
  let account: Account;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: AUTH_BASE });
    account = await createVerifiedAccount(request, "guard");
    await request.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: AUTH_BASE });
    await deleteAccountQuietly(request, account);
    await request.dispose();
  });

  test("sign out ends the session on the server: Back and a fresh visit, and the old cookie, open nothing (AC-5, AC-8)", async ({
    page,
    browser,
  }) => {
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home");
    const oldCookie = await sessionCookie(page);
    expect(oldCookie).toBeDefined();

    await signOutViaButton(page);
    expect(await sessionCookie(page)).toBeUndefined();

    // Back may land on a cached copy of the old page, so ask for the page again.
    await page.goBack().catch(() => null);
    await page.goto("/home");
    await expect(page).toHaveURL("/sign-in?returnTo=%2Fhome");

    // Someone who kept the old cookie gets nowhere either.
    const replay = await browser.newContext({ baseURL: AUTH_BASE });
    await replay.addCookies([oldCookie as NonNullable<typeof oldCookie>]);
    const replayPage = await replay.newPage();
    await replayPage.goto("/home");
    await expect(replayPage).toHaveURL("/sign-in?returnTo=%2Fhome");
    await replay.close();
  });

  test("a cookie whose session was removed on the server counts as signed out and never loops (AC-8)", async ({
    page,
    browser,
  }) => {
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home");
    const cookies = await page.context().cookies();

    // A second client holding the same cookie signs out, which deletes the session row.
    const other = await browser.newContext({ baseURL: AUTH_BASE });
    await other.addCookies(cookies);
    const signedOut = await other.request.post("/api/auth/sign-out", {
      headers: apiHeaders(freshIp()),
      data: {},
    });
    expect(signedOut.status()).toBe(200);
    await other.close();

    // The first browser still holds a cookie, but it no longer maps to a session.
    await page.goto("/home");
    await expect(page).toHaveURL("/sign-in?returnTo=%2Fhome");
    await page.goto("/sign-in");
    await expect(page).toHaveURL("/sign-in");
    await page.goto("/");
    await expect(page).toHaveURL("/");
  });

  test("the home page shows the email from the live session and is not indexed (AC-8)", async ({
    page,
  }) => {
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home");

    await expect(
      page.getByText(`You're signed in as ${account.email}.`),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
});

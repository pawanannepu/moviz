import type { Page } from "@playwright/test";
import {
  type Account,
  apiHeaders,
  createVerifiedAccount,
  deleteAccountQuietly,
  emailsTo,
  formAlert,
  freshIp,
  latestEmail,
  newDeviceContext,
  newEmail,
  PASSWORD,
  signInViaForm,
  signUpViaApi,
  waitForEmails,
  waitForTurnstileToken,
} from "../support/auth";
import { expect, test } from "../support/unique-ip";

// Spec 0005: password reset and the no leak rules (AC-6, AC-7, AC-9).
test.skip(
  !process.env.E2E_AUTH,
  "Run with: pnpm exec playwright test -c playwright.auth.config.ts",
);

const made: Account[] = [];
const NEW_PASSWORD = "brand-new-pass-2";

test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({
    baseURL: "http://localhost:3101",
  });
  for (const account of made) await deleteAccountQuietly(request, account);
  await request.dispose();
});

async function askForReset(page: Page, email: string): Promise<string> {
  await page.getByLabel("Email").fill(email);
  await waitForTurnstileToken(page);
  await page.getByRole("button", { name: "Send reset link" }).click();
  const sent = page.getByRole("status");
  await expect(sent).toContainText("Check your inbox");
  return ((await sent.textContent()) ?? "").replaceAll(email, "<email>");
}

async function chooseNewPassword(page: Page, password: string): Promise<void> {
  await page.getByLabel("New password").fill(password);
  await page.getByRole("button", { name: "Set new password" }).click();
}

test.describe("asking for a reset (AC-6)", () => {
  test("a known and an unknown email get the same message, and only the known one gets a link", async ({
    page,
    request,
  }) => {
    const known = await createVerifiedAccount(request, "reset-known");
    made.push(known);
    const unknown = newEmail("reset-unknown");
    const before = emailsTo(known.email).length;

    await page.goto("/forgot-password");
    const forKnown = await askForReset(page, known.email);
    await page.getByRole("button", { name: "Use a different email" }).click();
    const forUnknown = await askForReset(page, unknown);

    expect(forKnown).toBe(forUnknown);
    expect(forKnown).toContain(
      "If that email can be used, we sent a link to reset your password.",
    );
    const mail = (await waitForEmails(known.email, before + 1)).at(-1);
    expect(mail?.subject).toBe("Reset your Moviz password");
    await page.waitForTimeout(2000);
    expect(emailsTo(unknown)).toHaveLength(0);
  });

  test("the API answers a known and an unknown email with the same status and body", async ({
    request,
  }) => {
    const known = await createVerifiedAccount(request, "reset-api");
    made.push(known);
    const ask = (email: string) =>
      request.post("/api/auth/request-password-reset", {
        headers: apiHeaders(freshIp(), { "x-captcha-response": "tok" }),
        data: { email, redirectTo: "/reset-password" },
      });

    const a = await ask(known.email);
    const b = await ask(newEmail("reset-api-none"));

    expect(a.status()).toBe(b.status());
    expect(await a.json()).toEqual(await b.json());
  });

  test("the reset page sends no referrer", async ({ request }) => {
    const response = await request.get("/reset-password");

    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  });
});

test.describe("choosing a new password (AC-6, AC-10)", () => {
  test("the whole reset: token leaves the address bar, weak password is refused, other devices are signed out, the link works once", async ({
    page,
    browser,
    request,
  }) => {
    const account = await createVerifiedAccount(request, "reset-full");
    made.push(account);

    // Two other devices are signed in.
    const devices = [];
    for (let device = 0; device < 2; device += 1) {
      const context = await newDeviceContext(browser);
      const devicePage = await context.newPage();
      await signInViaForm(devicePage, account.email);
      await expect(devicePage).toHaveURL("/home");
      devices.push({ context, page: devicePage });
    }

    const before = emailsTo(account.email).length;
    await page.goto("/forgot-password");
    await askForReset(page, account.email);
    const link = (await waitForEmails(account.email, before + 1)).at(-1)
      ?.link as string;

    await page.goto(link);
    await expect(page).toHaveURL("/reset-password");
    await expect(
      page.getByRole("heading", { name: "Choose a new password" }),
    ).toBeVisible();

    await chooseNewPassword(page, "short");
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
    await expect(page.getByLabel("New password")).toBeFocused();
    await expect(page.getByLabel("New password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    await chooseNewPassword(page, NEW_PASSWORD);
    // The reset revokes sessions and hashes a password on a remote database.
    await expect(page).toHaveURL("/sign-in?notice=password-updated", {
      timeout: 15_000,
    });
    await expect(page.getByText("Password updated. Sign in.")).toBeVisible();

    for (const device of devices) {
      await device.page.goto("/home");
      await expect(device.page).toHaveURL("/sign-in?returnTo=%2Fhome");
      await device.context.close();
    }

    // The same link a second time.
    await page.goto(link);
    await expect(
      page.getByRole("heading", { name: "This link did not work" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "This link has expired or was already used. Ask for a new one.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ask for a new link" }),
    ).toHaveAttribute("href", "/forgot-password");

    // The old password is gone and the new one works.
    await signInViaForm(page, account.email, PASSWORD);
    await expect(formAlert(page)).toHaveText("Email or password is wrong.");
    await signInViaForm(page, account.email, NEW_PASSWORD);
    await expect(page).toHaveURL("/home");
    made.push({ email: account.email, password: NEW_PASSWORD });
  });

  test("a hand typed token shows the form, and submitting it says the link is no good", async ({
    page,
  }) => {
    // A press before the page has hydrated is a plain browser submit, so the
    // whole step is tried again until the form's own message shows.
    await expect(async () => {
      await page.goto("/reset-password?token=junk");
      await chooseNewPassword(page, NEW_PASSWORD);
      await expect(formAlert(page)).toContainText(
        "expired or was already used",
        { timeout: 4000 },
      );
    }).toPass({ timeout: 30_000 });
  });

  test("a signed in person opening /forgot-password goes home, but /reset-password stays reachable (AC-9)", async ({
    page,
    request,
  }) => {
    const account = await createVerifiedAccount(request, "reset-signedin");
    made.push(account);
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home");

    await page.goto("/forgot-password");
    await expect(page).toHaveURL("/home");
    await page.goto("/reset-password");
    await expect(page).toHaveURL("/reset-password");
  });

  test("asking too often shows the wait time (AC-11)", async ({ request }) => {
    const ip = freshIp();
    const ask = () =>
      request.post("/api/auth/request-password-reset", {
        headers: apiHeaders(ip, { "x-captcha-response": "tok" }),
        data: { email: newEmail("reset-limit"), redirectTo: "/reset-password" },
      });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await ask()).status()).toBe(200);
    }
    const limited = await ask();

    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()["x-retry-after"])).toBeGreaterThan(0);
  });
});

test.describe("a stranger signs up with someone else's address (AC-6, AC-7)", () => {
  test("the real owner resets, the email counts as verified, and the stranger's password stops working", async ({
    page,
    browser,
    request,
  }) => {
    const email = newEmail("hijack");
    const ownerPassword = "owner-pass-3456";
    made.push({ email, password: ownerPassword });
    await signUpViaApi(request, email, "stranger-pass-1");

    // A second sign up with the same address looks the same to the caller...
    const second = await request.post("/api/auth/sign-up/email", {
      headers: apiHeaders(freshIp(), { "x-captcha-response": "tok" }),
      data: {
        email,
        password: "other-pass-123",
        name: "x",
        callbackURL: "/verify-email",
      },
    });
    expect(second.status()).toBe(200);
    expect((await second.json()).token).toBeNull();

    // ...but the inbox owner gets a reset email, not a second verification.
    const resetMail = (await waitForEmails(email, 2)).find(
      (mail) => mail.subject === "Reset your Moviz password",
    );
    expect(resetMail?.link).toBeDefined();

    await page.goto(resetMail?.link as string);
    await chooseNewPassword(page, ownerPassword);
    await expect(page).toHaveURL("/sign-in?notice=password-updated");

    await signInViaForm(page, email, ownerPassword);
    await expect(page).toHaveURL("/home");

    const strangerContext = await newDeviceContext(browser);
    const strangerPage = await strangerContext.newPage();
    await signInViaForm(strangerPage, email, "stranger-pass-1");
    await expect(formAlert(strangerPage)).toHaveText(
      "Email or password is wrong.",
    );
    await strangerContext.close();
    expect(await latestEmail(email)).toBeDefined();
  });
});

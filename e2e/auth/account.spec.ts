import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { Pool } from "pg";
import {
  type Account,
  AUTH_SERVER_LOG,
  authLogLines,
  createVerifiedAccount,
  deleteAccountQuietly,
  formAlert,
  signInViaForm,
} from "../support/auth";
import { expect, test } from "../support/unique-ip";

// Spec 0014: the Account page, the data export and delete account (AC-6 to
// AC-11, AC-14).
test.skip(
  !process.env.E2E_AUTH,
  "Run with: pnpm exec playwright test -c playwright.auth.config.ts",
);

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const made: Account[] = [];

test.afterAll(async ({ request }) => {
  for (const account of made) await deleteAccountQuietly(request, account);
});

/** The terms version stored on a profile, read from the database the server uses. */
async function termsVersionFor(email: string): Promise<string | undefined> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No local env file (for example in CI). The real environment is used.
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query<{ terms_version: string }>(
      `select p.terms_version from profiles p
       join "user" u on u.id = p.user_id where u.email = $1`,
      [email],
    );
    return result.rows[0]?.terms_version;
  } finally {
    await pool.end();
  }
}

async function signedInOnAccount(page: Page, account: Account): Promise<void> {
  await signInViaForm(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("signed out visitors are sent to sign in (AC-6)", async ({ request }) => {
  const response = await request.get("/account", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("/sign-in?returnTo=%2Faccount");
});

test("the export route answers 401 with no data when signed out (AC-7)", async ({
  request,
}) => {
  const response = await request.get("/api/account/export");
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthenticated" });
});

test("the Account page shows the email and three sections, and passes axe (AC-6)", async ({
  page,
  request,
}) => {
  const account = await createVerifiedAccount(request, "account-page", {
    onboarded: false,
  });
  made.push(account);
  // Not onboarded: the page still opens.
  await signInViaForm(page, account.email, account.password);
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.goto("/account");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Account");
  await expect(page.getByText(account.email)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Your data",
    "Country",
    "Delete account",
  ]);
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});

test("the Country section saves through the picker (AC-8)", async ({
  page,
  request,
}) => {
  const account = await createVerifiedAccount(request, "account-country");
  made.push(account);
  await signedInOnAccount(page, account);

  const change = page.getByRole("button", { name: "Change country" });
  if (await change.isVisible()) await change.click();
  await page.getByRole("combobox", { name: "Country" }).selectOption("CA");
  await page.getByRole("button", { name: "Save" }).click();

  const line = page.locator("#account-country-line");
  await expect(line).toHaveText("Current country: Canada");
  await expect(line).toBeFocused();
  await page.reload();
  await expect(line).toHaveText("Current country: Canada");
});

test("Download my data returns the user's export as an attachment (AC-7, AC-14)", async ({
  page,
  request,
}) => {
  const account = await createVerifiedAccount(request, "account-export");
  made.push(account);
  await signedInOnAccount(page, account);

  const response = await page.request.get("/api/account/export");
  expect(response.status(), await response.text()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(response.headers()["content-disposition"]).toMatch(
    /^attachment; filename="moviz-data-\d{4}-\d{2}-\d{2}\.json"$/,
  );
  const body = await response.json();
  expect(body.account.email).toBe(account.email);
  const text = JSON.stringify(body).toLowerCase();
  expect(text).not.toContain(account.password);
  for (const secret of ["password", "token", "hash", "verification"]) {
    expect(text).not.toContain(secret);
  }
  expect(response.headers()["content-disposition"]).toContain(
    `moviz-data-${body.exportedAt.slice(0, 10)}.json`,
  );

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download my data" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^moviz-data-\d{4}-\d{2}-\d{2}\.json$/,
  );

  const line = authLogLines()
    .filter((entry) => entry.event === "data_exported")
    .at(-1);
  expect(line && Object.keys(line).sort()).toEqual(
    ["at", "event", "outcome", "type", "userId"].sort(),
  );
});

test("a wrong password keeps the account; the right one deletes it (AC-9, AC-10, AC-11)", async ({
  page,
  request,
}) => {
  // The `request` fixture, not `page.request`: the verify link signs in, and
  // that cookie must not reach the page.
  const account = await createVerifiedAccount(request, "account-delete");
  made.push(account);
  await signedInOnAccount(page, account);

  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByLabel("Your password")).toBeFocused();
  await expect(page.getByText("Enter your password.")).toBeVisible();

  await page.getByLabel("Your password").fill("not-the-password");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const wrong = page
    .getByRole("alert")
    .filter({ hasText: "That password is not right." });
  await expect(wrong).toBeVisible();
  await expect(wrong).toBeFocused();
  await expect(page).toHaveURL(/\/account$/);

  await page.getByLabel("Your password").fill(account.password);
  await page.getByRole("button", { name: "Delete my account" }).click();
  // The delete cascades through every user table on the remote database.
  await expect(page).toHaveURL(/\/\?deleted=1$/, { timeout: 20_000 });
  await expect(
    page
      .getByRole("status")
      .getByText("Your account and all its data are deleted."),
  ).toBeVisible();

  await signInViaForm(page, account.email, account.password);
  await expect(formAlert(page)).toHaveText("Email or password is wrong.");
});

test("signed in visitors can read the legal pages, and the footer links show on signed in pages (AC-1, AC-4)", async ({
  page,
  request,
}) => {
  const account = await createVerifiedAccount(request, "account-legal");
  made.push(account);
  await signInViaForm(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);

  for (const [path, title] of [
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms of use"],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  }
  for (const path of ["/home", "/account"]) {
    await page.goto(path);
    const legal = page
      .getByRole("contentinfo")
      .getByRole("navigation", { name: "Legal" });
    await expect(legal.getByRole("link", { name: "Privacy" })).toBeVisible();
    await expect(legal.getByRole("link", { name: "Terms" })).toBeVisible();
  }
});

test("a new account records the current terms version (AC-5)", async ({
  request,
}) => {
  const account = await createVerifiedAccount(request, "account-terms");
  made.push(account);

  expect(await termsVersionFor(account.email)).toBe("2026-11-12");
});

test("the sixth wrong password inside a minute is rate limited (AC-11)", async ({
  page,
  request,
}) => {
  const account = await createVerifiedAccount(request, "account-rate");
  made.push(account);
  await signedInOnAccount(page, account);
  const statuses: number[] = [];
  page.on("response", (response) => {
    if (response.url().endsWith("/api/auth/delete-user")) {
      statuses.push(response.status());
    }
  });

  for (let attempt = 0; attempt < 6; attempt++) {
    await page.getByLabel("Your password").fill(`wrong-password-${attempt}`);
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect.poll(() => statuses.length).toBe(attempt + 1);
  }

  expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Too many tries. Wait a minute and try again." }),
  ).toBeVisible();
});

test("no server log line outside the dev email printer holds a test email or password (AC-14)", async () => {
  const lines = readFileSync(AUTH_SERVER_LOG, "utf8")
    .split("\n")
    .filter((line) => !line.startsWith("[email]") && !/https?:\/\//.test(line));

  const leaks = lines.filter((line) =>
    /e2e-account-|correct-horse|wrong-password-/.test(line),
  );

  expect(leaks).toEqual([]);
});

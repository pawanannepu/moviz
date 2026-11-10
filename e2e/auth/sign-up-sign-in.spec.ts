import {
  type Account,
  apiHeaders,
  createVerifiedAccount,
  deleteAccountQuietly,
  emailsTo,
  formAlert,
  freshIp,
  latestEmail,
  newEmail,
  PASSWORD,
  sessionCookie,
  signInViaForm,
  signOutViaButton,
  signUpViaApi,
  signUpViaForm,
  waitForEmails,
  waitForTurnstileToken,
} from "../support/auth";
import { expect, test } from "../support/unique-ip";

// Spec 0005: sign up, verify, sign in, sign out. Runs with `playwright.auth.config.ts`.
test.skip(
  !process.env.E2E_AUTH,
  "Run with: pnpm exec playwright test -c playwright.auth.config.ts",
);

const made: Account[] = [];

test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({
    baseURL: "http://localhost:3101",
  });
  for (const account of made) await deleteAccountQuietly(request, account);
  await request.dispose();
});

test.describe("sign up, verify and sign out", () => {
  test("a new person signs up, opens the emailed link, lands signed in, signs out and signs in again (AC-1, AC-2, AC-4, AC-5)", async ({
    page,
  }) => {
    const email = newEmail("thread");
    made.push({ email, password: PASSWORD });

    await signUpViaForm(page, email);
    await expect(page.getByText(email)).toBeVisible();

    const mail = await latestEmail(email);
    expect(mail.subject).toBe("Confirm your email for Moviz");
    expect(mail.text).toContain("If you did not sign up, ignore this email.");
    expect(
      await sessionCookie(page),
      "sign up must not issue a session",
    ).toBeUndefined();

    // A new person has not finished onboarding, so /home sends them to the deck (spec 0006, AC-1).
    await page.goto(mail.link as string);
    await expect(page).toHaveURL("/onboarding", { timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: "What do you think of these?" }),
    ).toBeVisible();

    await signOutViaButton(page);
    expect(await sessionCookie(page)).toBeUndefined();

    await signInViaForm(page, email);
    await expect(page).toHaveURL("/onboarding", { timeout: 20_000 });
  });

  test("a verification link used a second time shows Already verified (AC-2)", async ({
    page,
    request,
  }) => {
    const account = await createVerifiedAccount(request, "reuse");
    made.push(account);
    const mail = await latestEmail(account.email);

    await page.goto(mail.link as string);

    await expect(page).toHaveURL("/verify-email");
    await expect(
      page.getByRole("heading", { name: "Already verified" }),
    ).toBeVisible();
    await expect(page.getByText("Already verified. Sign in.")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Go to sign in" }),
    ).toHaveAttribute("href", "/sign-in");
  });

  test("a bad verification link shows a clear message and a way to ask for a new one (AC-2)", async ({
    page,
  }) => {
    await page.goto(
      "/api/auth/verify-email?token=junk&callbackURL=%2Fverify-email",
    );

    await expect(page).toHaveURL(/\/verify-email\?error=/);
    await expect(
      page.getByRole("heading", { name: "This link did not work" }),
    ).toBeVisible();
    await expect(formAlert(page)).toContainText("expired or was already used");
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("the sign up form can be used twice without reloading, because the bot check token is renewed (AC-10, AC-11)", async ({
    page,
  }) => {
    const first = newEmail("twice-a");
    const second = newEmail("twice-b");
    const sent: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/auth/sign-up/email"))
        sent.push(req.headers()["x-captcha-response"] ?? "none");
    });

    await signUpViaForm(page, first);
    await page.getByRole("button", { name: "Use a different email" }).click();
    await page.getByLabel("Email").fill(second);
    await page.getByLabel("Password").first().fill(PASSWORD);
    await waitForTurnstileToken(page);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText(second)).toBeVisible({ timeout: 15_000 });
    expect(sent).toHaveLength(2);
    expect(sent.every((token) => token !== "none")).toBe(true);
  });

  test("a sign up with no usable bot check token is refused in the browser and sends no request (AC-10, AC-11)", async ({
    page,
  }) => {
    await page.route("**/challenges.cloudflare.com/**", (route) =>
      route.abort(),
    );
    let calls = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/auth/sign-up/email")) calls += 1;
    });

    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(newEmail("blocked"));
    await page.getByLabel("Password").first().fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(formAlert(page)).toHaveText(
      "We could not confirm you are a person. Try again.",
    );
    expect(calls).toBe(0);
  });
});

test.describe("an unverified person signing in (AC-3)", () => {
  test("sees the verify panel, gets a fresh link that goes to /verify-email, and the resend button waits (AC-3, AC-11)", async ({
    page,
    request,
  }) => {
    const email = newEmail("unverified");
    made.push({ email, password: PASSWORD });
    await signUpViaApi(request, email);
    const before = (await waitForEmails(email)).length;

    await signInViaForm(page, email);

    await expect(
      page.getByText("Verify your email first. We can send the link again."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Send the link again in \d+s/ }),
    ).toBeDisabled();
    await expect(page).toHaveURL(/\/sign-in/);

    const emails = await waitForEmails(email, before + 1);
    const fresh = emails[emails.length - 1];
    expect(fresh?.link).toContain("callbackURL=%2Fverify-email");
  });

  test("the fresh link from a sign in attempt works, and used again it says Already verified (AC-2, AC-3)", async ({
    page,
    request,
  }) => {
    const email = newEmail("unverified-link");
    made.push({ email, password: PASSWORD });
    await signUpViaApi(request, email);
    const before = (await waitForEmails(email)).length;
    await signInViaForm(page, email);
    await expect(
      page.getByText("Verify your email first. We can send the link again."),
    ).toBeVisible();
    const link = (await waitForEmails(email, before + 1)).at(-1)
      ?.link as string;

    await page.goto(link);
    await expect(page).toHaveURL("/onboarding", { timeout: 20_000 });
    await page.context().clearCookies();
    await page.goto(link);

    await expect(page).toHaveURL("/verify-email");
    await expect(page.getByText("Already verified. Sign in.")).toBeVisible();
  });

  test("a second resend inside the minute is refused by the server with the wait time (AC-11)", async ({
    request,
  }) => {
    const ip = freshIp();
    const email = newEmail("resend");
    const send = () =>
      request.post("/api/auth/send-verification-email", {
        headers: apiHeaders(ip),
        data: { email, callbackURL: "/verify-email" },
      });

    expect((await send()).status()).toBe(200);
    const second = await send();

    expect(second.status()).toBe(429);
    expect(Number(second.headers()["x-retry-after"])).toBeGreaterThan(0);
  });
});

test.describe("signing in", () => {
  let account: Account;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext({
      baseURL: "http://localhost:3101",
    });
    account = await createVerifiedAccount(request, "signin");
    made.push(account);
    await request.dispose();
  });

  test("a wrong password and an unknown email show the same message and stay on the page (AC-4)", async ({
    page,
  }) => {
    await signInViaForm(page, account.email, "not-the-password");
    await expect(formAlert(page)).toHaveText("Email or password is wrong.");

    await signInViaForm(page, newEmail("nobody"), PASSWORD);
    await expect(formAlert(page)).toHaveText("Email or password is wrong.");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("lands on the page the person tried to reach, by a full navigation (AC-4, AC-8)", async ({
    page,
  }) => {
    await page.goto("/home");
    await expect(page).toHaveURL("/sign-in?returnTo=%2Fhome");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").first().fill(account.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL("/home");
    await expect(
      page.getByText(`You're signed in as ${account.email}.`),
    ).toBeVisible();
  });

  for (const unsafe of [
    "//evil.com",
    "https://evil.com",
    "/\\evil.com",
    "/sign-up",
    "%2F%2Fevil.com",
    "/.//evil.com",
    "/..//evil.com",
    "/a/..//evil.com",
    "%2F%2e%2F%2Fevil.com",
    "/api/auth/get-session",
  ]) {
    test(`returnTo=${unsafe} lands on home (AC-4)`, async ({ page }) => {
      const query = unsafe.startsWith("%")
        ? unsafe
        : encodeURIComponent(unsafe).replaceAll("%2F", "/");
      await signInViaForm(
        page,
        account.email,
        account.password,
        `/sign-in?returnTo=${query}`,
      );

      await expect(page).toHaveURL("/home");
    });
  }

  test("sets a 30 day, HttpOnly, SameSite=Lax session cookie (AC-4, AC-15)", async ({
    page,
  }) => {
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home");

    const cookie = await sessionCookie(page);

    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    const days = ((cookie?.expires ?? 0) - Date.now() / 1000) / 86_400;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30);
  });

  test("a signed in person opening /, /sign-in, /sign-up or /forgot-password is sent home (AC-9)", async ({
    page,
  }) => {
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home");

    for (const path of ["/", "/sign-in", "/sign-up", "/forgot-password"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL("/home");
    }
  });

  test("shows the password updated notice only for the known key (AC-6, AC-10)", async ({
    page,
  }) => {
    await page.goto("/sign-in?notice=password-updated");
    await expect(page.getByText("Password updated. Sign in.")).toBeVisible();

    await page.goto("/sign-in?notice=anything-else");
    await expect(page.getByText("Password updated.")).toHaveCount(0);

    await page.goto(`/sign-in?notice=${encodeURIComponent("<b>hi</b>")}`);
    await expect(page.locator("main b")).toHaveCount(0);
  });

  test("the sixth attempt in a minute shows the wait time from the server (AC-11)", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await page.getByLabel("Email").fill(account.email);
      await page.getByLabel("Password").first().fill("not-the-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      if (attempt < 6)
        await expect(formAlert(page)).toHaveText("Email or password is wrong.");
    }

    await expect(formAlert(page)).toHaveText(
      /^Too many attempts\. Try again in \d+ seconds?\.$/,
    );
  });

  test("an empty submit puts focus on the first invalid field and shows inline errors (AC-10)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/sign-in");

    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByLabel("Email")).toBeFocused();
    await expect(page.getByLabel("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(
      page.getByText("Enter a valid email, like name@example.com."),
    ).toBeVisible();
    await expect(page.getByText("Enter your password.")).toBeVisible();
  });

  test("the show password toggle reveals and hides the password and reports its state (AC-10)", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    const field = page.getByLabel("Password").first();
    const toggle = page.getByRole("button", { name: "Show password" });
    await field.fill("abc12345");

    await toggle.click();
    await expect(field).toHaveAttribute("type", "text");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(field).toHaveAttribute("type", "password");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("a sign up for an address that already has an account (AC-7)", () => {
  test("gets the same shape and the same name as a new address, even when the client sends another name", async ({
    request,
  }) => {
    const existing = await createVerifiedAccount(request, "dup");
    made.push(existing);
    const post = (email: string) =>
      request.post("/api/auth/sign-up/email", {
        headers: apiHeaders(freshIp(), { "x-captcha-response": "tok" }),
        data: {
          email,
          password: PASSWORD,
          name: "zed",
          callbackURL: "/verify-email",
        },
      });

    const forExisting = await post(existing.email);
    const fresh = newEmail("dup-new");
    made.push({ email: fresh, password: PASSWORD });
    const forNew = await post(fresh);

    expect(forExisting.status()).toBe(forNew.status());
    const a = await forExisting.json();
    const b = await forNew.json();
    expect(Object.keys(a.user).sort()).toEqual(Object.keys(b.user).sort());
    expect(a.token).toBeNull();
    expect(b.token).toBeNull();
    expect(a.user.name).toBe(existing.email.split("@")[0]);
    expect(b.user.name).toBe(fresh.split("@")[0]);
    expect(a.user.name).not.toBe("zed");
    expect(b.user.name).not.toBe("zed");
  });

  test("tells the owner of a verified account by email, with sign in and reset links and no token", async ({
    page,
    request,
  }) => {
    const account = await createVerifiedAccount(request, "owner");
    made.push(account);
    const before = emailsTo(account.email).length;

    await signUpViaForm(page, account.email, "someone-else-pw-1");

    const mail = (await waitForEmails(account.email, before + 1)).at(-1);
    expect(mail?.subject).toBe("You already have a Moviz account");
    expect(mail?.text).toContain("/sign-in");
    expect(mail?.text).toContain("/forgot-password");
    expect(mail?.text).not.toMatch(/token=/);
  });
});

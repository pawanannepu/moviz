import AxeBuilder from "@axe-core/playwright";
import {
  type Account,
  AUTH_BASE,
  apiHeaders,
  authLogLines,
  createVerifiedAccount,
  deleteAccountQuietly,
  freshIp,
  newEmail,
  PASSWORD,
  sessionCookie,
  signInViaForm,
  signOutViaButton,
} from "../support/auth";
import { expect, test } from "../support/unique-ip";

// Spec 0005: bot check, rate limits, origin check, account deletion, logs and
// accessibility (AC-10, AC-11, AC-13, AC-15, AC-16).
test.skip(
  !process.env.E2E_AUTH,
  "Run with: pnpm exec playwright test -c playwright.auth.config.ts",
);

const SIGN_UP = "/api/auth/sign-up/email";
const RESET = "/api/auth/request-password-reset";
const SIGN_IN = "/api/auth/sign-in/email";

test.describe("bot check (AC-11)", () => {
  test("sign up and reset are refused without a token, with a clear code", async ({
    request,
  }) => {
    const signUp = await request.post(SIGN_UP, {
      headers: apiHeaders(freshIp()),
      data: { email: newEmail("nocaptcha"), password: PASSWORD, name: "x" },
    });
    const reset = await request.post(RESET, {
      headers: apiHeaders(freshIp()),
      data: { email: newEmail("nocaptcha"), redirectTo: "/reset-password" },
    });

    for (const response of [signUp, reset]) {
      expect(response.status()).toBe(400);
      expect((await response.json()).code).toBe("MISSING_RESPONSE");
    }
  });

  test("sign in is not behind the bot check: a wrong password answers 401, not a captcha error", async ({
    request,
  }) => {
    const response = await request.post(SIGN_IN, {
      headers: apiHeaders(freshIp()),
      data: { email: newEmail("nobody"), password: PASSWORD },
    });

    expect(response.status()).toBe(401);
    expect((await response.json()).code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  test("the sign up page ships the site key but never the secret, and no public env name", async ({
    request,
  }) => {
    const html = await (await request.get("/sign-up")).text();

    expect(html).toContain("1x00000000000000000000AA");
    expect(html).not.toContain("1x0000000000000000000000000000000AA");
    expect(html).not.toContain("NEXT_PUBLIC_TURNSTILE");
  });
});

test.describe("rate limits are per client address (AC-11)", () => {
  test("the fourth sign up in a minute is refused with the wait time", async ({
    request,
  }) => {
    const ip = freshIp();
    const post = () =>
      request.post(SIGN_UP, {
        headers: apiHeaders(ip, { "x-captcha-response": "tok" }),
        data: {
          email: newEmail("limit"),
          password: PASSWORD,
          name: "x",
          callbackURL: "/verify-email",
        },
      });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await post()).status()).toBe(200);
    }
    const limited = await post();

    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()["x-retry-after"])).toBeGreaterThan(0);
  });

  test("the sixth sign in in a minute is refused, and another address is not affected", async ({
    request,
  }) => {
    const ip = freshIp();
    const attempt = (address: string) =>
      request.post(SIGN_IN, {
        headers: apiHeaders(address),
        data: { email: newEmail("limit-in"), password: PASSWORD },
      });

    for (let count = 0; count < 5; count += 1) {
      expect((await attempt(ip)).status()).toBe(401);
    }
    const limited = await attempt(ip);
    const other = await attempt(freshIp());

    expect(limited.status()).toBe(429);
    expect(limited.headers()["x-retry-after"]).toBeDefined();
    expect(other.status()).toBe(401);
  });
});

test.describe("origin and cookies (AC-15)", () => {
  test("a sign in from another origin is rejected", async ({ request }) => {
    const response = await request.post(SIGN_IN, {
      headers: apiHeaders(freshIp(), { origin: "https://evil.example" }),
      data: { email: newEmail("evil"), password: PASSWORD },
    });

    expect(response.status()).toBe(403);
    expect((await response.json()).code).toBe("INVALID_ORIGIN");
  });
});

test.describe("deleting an account (AC-13, AC-16)", () => {
  test("needs the current password, then removes the user, its sessions and the cookie", async ({
    page,
    request,
  }) => {
    const account = await createVerifiedAccount(request, "delete");
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home");
    const ip = freshIp();
    const remove = (data: Record<string, unknown>) =>
      page.request.post("/api/auth/delete-user", {
        headers: apiHeaders(ip),
        data,
      });

    const none = await remove({});
    const blank = await remove({ password: "" });
    const wrong = await remove({ password: "nope-nope-nope" });
    expect(none.status()).toBe(400);
    expect((await none.json()).code).toBe("PASSWORD_REQUIRED");
    expect(blank.status()).toBe(400);
    expect((await blank.json()).code).toBe("PASSWORD_REQUIRED");
    expect(wrong.status()).toBe(400);
    await page.goto("/home");
    await expect(page).toHaveURL("/home");

    const done = await remove({ password: account.password });
    expect(done.status()).toBe(200);
    expect(await sessionCookie(page)).toBeUndefined();

    await page.goto("/home");
    await expect(page).toHaveURL("/sign-in?returnTo=%2Fhome");
    await signInViaForm(page, account.email);
    await expect(page.getByText("Email or password is wrong.")).toBeVisible();
    expect(
      authLogLines().some((line) => line.event === "account_deleted"),
    ).toBe(true);
  });
});

test.describe("what the server logs (AC-16)", () => {
  let account: Account;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: AUTH_BASE });
    account = await createVerifiedAccount(request, "logs");
    await request.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: AUTH_BASE });
    await deleteAccountQuietly(request, account);
    await request.dispose();
  });

  test("auth lines hold only the event, outcome, time and user id, and never an email, token or address", async ({
    page,
  }) => {
    await signInViaForm(page, account.email, "wrong-password-1");
    await expect(page.getByText("Email or password is wrong.")).toBeVisible();
    await signInViaForm(page, account.email);
    await expect(page).toHaveURL("/home");
    await signOutViaButton(page);

    const lines = authLogLines();

    expect(lines.length).toBeGreaterThan(0);
    const events = new Set(lines.map((line) => line.event));
    for (const event of ["sign_up", "email_verified", "sign_in", "sign_out"]) {
      expect(events.has(event), event).toBe(true);
    }
    for (const line of lines) {
      expect(
        Object.keys(line).every((key) =>
          ["type", "event", "outcome", "at", "userId"].includes(key),
        ),
      ).toBe(true);
      const text = JSON.stringify(line);
      expect(text).not.toContain("@");
      expect(text).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
      expect(text).not.toContain("eyJ");
    }
  });
});

test.describe("accessibility and keyboard at 320px (AC-10)", () => {
  const PAGES = [
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/verify-email?error=INVALID_TOKEN",
  ];

  for (const path of PAGES) {
    test(`${path} has no axe violations, no sideways scroll, and a visible focus ring on every stop`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 700 });
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();

      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(scan.violations).toEqual([]);

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);

      // Tab through the page: every stop must show a focus indicator.
      const stops = await page.evaluate(async () => {
        const seen: { name: string; ring: boolean }[] = [];
        const focusables = [
          ...document.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea',
          ),
        ];
        for (const element of focusables) {
          element.focus();
          const style = getComputedStyle(element);
          const ring =
            (style.outlineStyle !== "none" && style.outlineWidth !== "0px") ||
            style.boxShadow !== "none";
          seen.push({
            name:
              element.getAttribute("name") ??
              element.textContent?.trim().slice(0, 20) ??
              element.tagName,
            ring,
          });
        }
        return seen;
      });
      expect(stops.length).toBeGreaterThan(0);
      expect(stops.filter((stop) => !stop.ring)).toEqual([]);
    });
  }

  test("every field on the sign in and sign up forms has a label and the right autocomplete", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(page.getByLabel("Email")).toHaveAttribute(
      "autocomplete",
      /email|username/,
    );
    await expect(page.getByLabel("Password").first()).toHaveAttribute(
      "autocomplete",
      "current-password",
    );

    await page.goto("/sign-up");
    await expect(page.getByLabel("Email")).toHaveAttribute(
      "autocomplete",
      /email|username/,
    );
    await expect(page.getByLabel("Password").first()).toHaveAttribute(
      "autocomplete",
      "new-password",
    );

    await page.goto("/reset-password?token=junk");
    await expect(page.getByLabel("New password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });
});

test.describe("a form submitted before its script runs (AC-10, AC-16)", () => {
  // A submit before hydration, or with scripts blocked, is a native browser
  // submit. It must never put a password in the address bar, where history,
  // referrers and server logs would keep it.
  test.use({ javaScriptEnabled: false });

  const SECRET = "Sneaky-pass-77";

  for (const [path, fields] of [
    ["/sign-in", ["Email", "Password"]],
    ["/sign-up", ["Email", "Password"]],
    ["/reset-password?token=junk", ["New password"]],
  ] as const) {
    test(`${path} keeps the password out of the address`, async ({ page }) => {
      await page.goto(path);
      for (const label of fields) {
        const value = label === "Email" ? "someone@example.com" : SECRET;
        await page.getByLabel(label).first().fill(value);
      }

      await page.locator("form button[type=submit]").first().click();
      await page.waitForLoadState("load");

      expect(decodeURIComponent(page.url())).not.toContain(SECRET);
    });
  }
});

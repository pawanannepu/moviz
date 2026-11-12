import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Spec 0014: the privacy policy, the terms, the footer links and the sign up
// consent line, all open to signed out visitors (AC-1 to AC-5).
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const PAGES = [
  {
    path: "/privacy",
    h1: "Privacy policy",
    sections: [
      "Who runs Moviz",
      "What we collect",
      "Why we use it",
      "Who else handles it",
      "How long we keep it",
      "Cookies",
      "Your rights",
      "International transfers",
      "Children",
      "Changes to this policy",
    ],
  },
  {
    path: "/terms",
    h1: "Terms of use",
    sections: [
      "What Moviz is",
      "Your account",
      "Acceptable use",
      "Movie data and recommendations",
      "The service as it is",
      "Ending your account",
      "Changes to these terms",
      "Contact",
    ],
  },
] as const;

for (const legal of PAGES) {
  test(`${legal.path} renders signed out with its headings in order and passes axe (AC-1)`, async ({
    page,
  }) => {
    const response = await page.goto(legal.path);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(legal.h1);
    await expect(page.getByText("Last updated 12 November 2026")).toBeVisible();
    await expect(
      page.locator("article").getByRole("heading", { level: 2 }),
    ).toHaveText([...legal.sections]);
    await expect(
      page.getByText("[to be filled before launch]").first(),
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
}

test("the privacy policy names every processor and TMDB as the image host (AC-2)", async ({
  page,
}) => {
  await page.goto("/privacy");
  for (const name of [
    "Neon",
    "Vercel",
    "Resend",
    "Voyage AI",
    "Cloudflare Turnstile",
    "TMDB",
  ]) {
    await expect(
      page.locator("dt").filter({ hasText: new RegExp(`^${name} ·`) }),
    ).toHaveCount(1);
  }
});

for (const path of ["/", "/sign-in", "/privacy"]) {
  test(`the footer on ${path} has Privacy and Terms links above the TMDB notice (AC-4)`, async ({
    page,
  }) => {
    await page.goto(path);
    const footer = page.getByRole("contentinfo");
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    const legal = footer.getByRole("navigation", { name: "Legal" });
    await expect(legal.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(legal.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
  });
}

test("sign up shows the consent line above the button, with new tab links (AC-5)", async ({
  page,
}) => {
  await page.goto("/sign-up");
  const line = page.getByText(
    "By creating an account, you agree to the Terms of use",
  );
  await expect(line).toBeVisible();

  const terms = line.getByRole("link", {
    name: "Terms of use (opens in a new tab)",
  });
  const privacy = line.getByRole("link", {
    name: "Privacy policy (opens in a new tab)",
  });
  await expect(terms).toHaveAttribute("target", "_blank");
  await expect(privacy).toHaveAttribute("target", "_blank");

  const lineBox = await line.boundingBox();
  const buttonBox = await page
    .getByRole("button", { name: "Create account" })
    .boundingBox();
  expect(lineBox && buttonBox && lineBox.y < buttonBox.y).toBe(true);
});

test("the landing page shows the deleted status line only for deleted=1 (AC-10)", async ({
  page,
}) => {
  await page.goto("/?deleted=1");
  await expect(
    page
      .getByRole("status")
      .getByText("Your account and all its data are deleted."),
  ).toBeVisible();

  await page.goto("/?deleted=yes");
  await expect(
    page.getByText("Your account and all its data are deleted."),
  ).toHaveCount(0);
});

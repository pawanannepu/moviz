import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// Spec 0004: the /design review page, the swipe card and the feed grid.

const WIDTHS = [320, 360, 768, 1280] as const;

const card = (page: Page) => page.locator('[data-slot="swipe-card"]').first();
const poster = (page: Page) =>
  page.locator('[data-slot="swipe-poster"]').first();
const liveRegion = (page: Page) =>
  page.locator('[data-slot="swipe-deck"] [role="status"]');

/**
 * Drags the swipe poster with dispatched pointer events. `stepMs` sets the
 * speed: slow steps make a plain drag, fast steps make a flick.
 */
async function dragPoster(
  page: Page,
  options: {
    pointerType: "mouse" | "touch" | "pen";
    dx: number;
    dy: number;
    stepMs?: number;
    cancel?: boolean;
  },
) {
  await page.evaluate(async ({ pointerType, dx, dy, stepMs = 30, cancel }) => {
    const element = document.querySelector('[data-slot="swipe-poster"]');
    if (!element) throw new Error("No swipe poster on the page");
    const rect = element.getBoundingClientRect();
    const x0 = rect.x + rect.width / 2;
    const y0 = rect.y + rect.height / 2;
    const fire = (type: string, x: number, y: number) =>
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 5,
          pointerType,
          isPrimary: true,
          button: 0,
          buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
          clientX: x,
          clientY: y,
        }),
      );

    fire("pointerdown", x0, y0);
    for (let step = 1; step <= 10; step++) {
      await new Promise((resolve) => setTimeout(resolve, stepMs));
      fire("pointermove", x0 + (dx * step) / 10, y0 + (dy * step) / 10);
    }
    fire(cancel ? "pointercancel" : "pointerup", x0 + dx, y0 + dy);
  }, options);
}

test.describe("design page", () => {
  test("is available outside production (AC-17)", async ({ page }) => {
    const response = await page.goto("/design");

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "The subtitle line" }),
    ).toBeVisible();
  });

  test("shows the header with the current page marked (AC-7)", async ({
    page,
  }) => {
    await page.goto("/design");
    const nav = page.getByRole("navigation", { name: "Main" });

    await expect(nav.getByRole("link", { name: "Design" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("passes the WCAG A and AA accessibility scan (AC-18)", async ({
    page,
  }) => {
    await page.goto("/design");

    const results = await new AxeBuilder({ page })
      .exclude("nextjs-portal")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      ),
    ).toEqual([]);
  });

  test("has the skip link as the first stop (AC-5)", async ({ page }) => {
    await page.goto("/design");

    await page.keyboard.press("Tab");

    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
  });

  for (const width of WIDTHS) {
    test.describe(`at ${width}px wide`, () => {
      test.use({ viewport: { width, height: 800 } });

      test("does not scroll sideways (AC-16)", async ({ page }) => {
        await page.goto("/design");

        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );

        expect(overflow).toBeLessThanOrEqual(0);
      });

      test("stacks the swipe card the same way: poster, title, three buttons in a row (AC-16)", async ({
        page,
      }) => {
        await page.goto("/design");
        const root = card(page);
        const posterBox = await poster(page).boundingBox();
        const buttons = await root.getByRole("button").evaluateAll((els) =>
          els.map((el) => {
            const { x, y, width: w, right } = el.getBoundingClientRect();
            return { x, y, w, right };
          }),
        );

        expect(posterBox).not.toBeNull();
        expect(buttons).toHaveLength(3);
        // One row, in order, each at least 44px wide, all inside the screen.
        expect(new Set(buttons.map((b) => Math.round(b.y))).size).toBe(1);
        expect(buttons.map((b) => b.x)).toEqual(
          [...buttons.map((b) => b.x)].sort((a, b) => a - b),
        );
        for (const button of buttons) {
          expect(button.w).toBeGreaterThanOrEqual(44);
          expect(button.right).toBeLessThanOrEqual(width);
        }
        expect(buttons[0].y).toBeGreaterThan(
          (posterBox?.y ?? 0) + (posterBox?.height ?? 0),
        );
      });
    });
  }

  test("shows feed items in one column on a phone and more columns when there is room (AC-16)", async ({
    page,
  }) => {
    const columns = async () =>
      page.evaluate(() => {
        const items = document.querySelectorAll(
          'section[aria-labelledby="feed-item-title"] [data-slot="movie-card"]',
        );
        return new Set(
          Array.from(items).map((el) =>
            Math.round(el.getBoundingClientRect().x),
          ),
        ).size;
      });

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/design");
    expect(await columns()).toBe(1);

    await page.setViewportSize({ width: 1280, height: 800 });
    expect(await columns()).toBeGreaterThan(1);
  });

  test("keeps the reason of a long feed item fully visible (AC-9)", async ({
    page,
  }) => {
    await page.goto("/design");
    const bar = page
      .locator('[data-slot="subtitle-bar"]')
      .filter({ hasText: "the next to see" });

    await bar.scrollIntoViewIfNeeded();
    const fits = await bar.evaluate(
      (el) => el.scrollHeight <= el.clientHeight + 1,
    );

    expect(fits).toBe(true);
    await expect(bar).toContainText(
      "Because you rated Heat and Collateral highly",
    );
  });
});

test.describe("swipe card", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/design");
    await card(page).scrollIntoViewIfNeeded();
  });

  test("always has three labelled buttons, and Like works with no drag (AC-10)", async ({
    page,
  }) => {
    const root = card(page);

    await expect(root.getByRole("button")).toHaveText([
      "Dislike",
      "Not seen",
      "Like",
    ]);

    await root.getByRole("button", { name: "Like", exact: true }).click();

    await expect(liveRegion(page)).toHaveText(/^Liked /);
  });

  test("Dislike and Not seen buttons announce their choice (AC-10)", async ({
    page,
  }) => {
    await card(page).getByRole("button", { name: "Dislike" }).click();
    await expect(liveRegion(page)).toHaveText(/^Disliked /);

    await expect(
      card(page).getByRole("button", { name: "Not seen" }),
    ).toBeEnabled();
    await card(page).getByRole("button", { name: "Not seen" }).click();
    await expect(liveRegion(page)).toHaveText(/^Marked .* as not seen$/);
  });

  for (const pointerType of ["mouse", "touch", "pen"] as const) {
    test(`a drag right likes, left dislikes and up marks not seen with a ${pointerType} (AC-11)`, async ({
      page,
    }) => {
      await dragPoster(page, { pointerType, dx: 170, dy: 8 });
      await expect(liveRegion(page)).toHaveText(/^Liked /);
      await expect(page.getByText(/Last decision: liked/)).toBeVisible();
      // Wait for the pretend save so the next card is ready.
      await expect(page.getByText(/Last decision: liked/)).toBeVisible();
      await page.waitForTimeout(800);

      await dragPoster(page, { pointerType, dx: -170, dy: -6 });
      await expect(liveRegion(page)).toHaveText(/^Disliked /);
      await page.waitForTimeout(800);

      await dragPoster(page, { pointerType, dx: 4, dy: -190 });
      await expect(liveRegion(page)).toHaveText(/^Marked .* as not seen$/);
    });
  }

  test("a real mouse drag works too (AC-11)", async ({ page }) => {
    const box = await poster(page).boundingBox();
    if (!box) throw new Error("No poster box");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 90, y + 4, { steps: 6 });
    await expect(poster(page)).toHaveAttribute("data-phase", "dragging");
    await expect(poster(page).locator("p[aria-hidden]")).toHaveText("Like");
    await page.mouse.move(x + 180, y + 6, { steps: 6 });
    await page.mouse.up();

    await expect(liveRegion(page)).toHaveText(/^Liked /);
  });

  test("a short, slow drag returns the card (AC-11)", async ({ page }) => {
    await dragPoster(page, { pointerType: "touch", dx: 50, dy: 0, stepMs: 60 });

    await expect(poster(page)).toHaveAttribute("data-phase", "idle");
    await expect(poster(page)).not.toHaveAttribute("data-exit", /.*/);
    await expect(liveRegion(page)).toHaveText("");
  });

  test("a canceled pointer returns the card (AC-11)", async ({ page }) => {
    await dragPoster(page, {
      pointerType: "touch",
      dx: 170,
      dy: 0,
      cancel: true,
    });

    await expect(poster(page)).toHaveAttribute("data-phase", "idle");
    await expect(liveRegion(page)).toHaveText("");
  });

  test("a drag down never decides (AC-11)", async ({ page }) => {
    await dragPoster(page, { pointerType: "mouse", dx: 0, dy: 220 });

    await expect(liveRegion(page)).toHaveText("");
  });

  test("only the poster takes touch drags, so the page still scrolls elsewhere (AC-16)", async ({
    page,
  }) => {
    const touchAction = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).touchAction);

    expect(await touchAction('[data-slot="swipe-poster"]')).toBe("none");
    expect(await touchAction('[data-slot="swipe-card"]')).not.toBe("none");
    expect(await touchAction('[data-slot="swipe-card"] button')).not.toBe(
      "none",
    );
  });

  test("arrow keys act when the card has focus, and ArrowUp does not scroll (AC-12)", async ({
    page,
  }) => {
    await card(page).focus();
    const before = await page.evaluate(() => window.scrollY);

    await page.keyboard.press("ArrowUp");

    await expect(liveRegion(page)).toHaveText(/^Marked .* as not seen$/);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test("ArrowRight likes and focus lands on the new card (AC-12)", async ({
    page,
  }) => {
    const first = await card(page).getAttribute("aria-label");
    await card(page).focus();

    await page.keyboard.press("ArrowRight");

    await expect(liveRegion(page)).toHaveText(/^Liked /);
    await expect(card(page)).not.toHaveAttribute("aria-label", first ?? "");
    await expect(card(page)).toBeFocused();
  });

  test("a button press keeps focus on the same button of the new card (AC-12)", async ({
    page,
  }) => {
    const first = await card(page).getAttribute("aria-label");

    await card(page).getByRole("button", { name: "Dislike" }).click();

    await expect(card(page)).not.toHaveAttribute("aria-label", first ?? "");
    await expect(
      card(page).getByRole("button", { name: "Dislike" }),
    ).toBeFocused();
  });

  test("decides once when a key is pressed twice quickly (AC-12)", async ({
    page,
  }) => {
    await card(page).focus();

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(900);

    await expect(page.getByText(/Last decision: liked/)).toBeVisible();
    // Only one movie was passed: the second card is still showing.
    const label = await card(page).getAttribute("aria-label");
    expect(label).not.toBeNull();
  });

  test("returns the card when a save fails, and takes input again (AC-12)", async ({
    page,
  }) => {
    const first = await card(page).getAttribute("aria-label");
    await page.getByRole("button", { name: "Fail the next save" }).click();

    await card(page).getByRole("button", { name: "Like", exact: true }).click();

    await expect(page.getByText(/Couldn't save liked/)).toBeVisible();
    await expect(card(page)).toHaveAttribute("aria-label", first ?? "");
    await expect(poster(page)).not.toHaveAttribute("data-exit", /.*/);

    await card(page).getByRole("button", { name: "Like", exact: true }).click();
    await expect(card(page)).not.toHaveAttribute("aria-label", first ?? "");
  });

  test("has a named group with a visible hint (AC-12)", async ({ page }) => {
    const root = card(page);

    await expect(root).toHaveAttribute("role", "group");
    await expect(root).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowLeft ArrowRight ArrowUp",
    );
    await expect(root.getByText("Use arrow keys or the buttons")).toBeVisible();
    const describedBy = await root.getAttribute("aria-describedby");
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(
      "Use arrow keys or the buttons",
    );
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("skips the exit and the return, and every flow still works (AC-13)", async ({
    page,
  }) => {
    await page.goto("/design");
    await card(page).scrollIntoViewIfNeeded();

    const duration = await poster(page).evaluate(
      (el) => getComputedStyle(el).transitionDuration,
    );
    expect(duration).toBe("0s");

    const first = await card(page).getAttribute("aria-label");
    await card(page).getByRole("button", { name: "Like", exact: true }).click();
    await expect(liveRegion(page)).toHaveText(/^Liked /);
    await expect(card(page)).not.toHaveAttribute("aria-label", first ?? "");
    expect(
      await card(page).evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
  });

  test("never hides a reason for the reveal (AC-13)", async ({ page }) => {
    await page.goto("/design");

    await expect(page.locator("[data-reveal]")).toHaveCount(0);
  });
});

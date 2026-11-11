// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { use } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";

// Spec 0008: the guards (AC-1), the shell that does not wait for the picks
// (AC-5) and the noscript line (AC-16). The recommender, the session and the
// profile read are boundaries, so they are replaced.
const requireUser = vi.fn();
const getProfile = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
const loadFeedBatch = vi.fn();
const { fakeDb, feed } = vi.hoisted(() => ({
  fakeDb: { name: "fake-db" },
  feed: { mode: "ready" as "ready" | "slow" },
}));

vi.mock("@/auth/session", () => ({
  requireUser: (...args: unknown[]) => requireUser(...args),
}));
vi.mock("@/db/client", () => ({ db: fakeDb }));
vi.mock("@/profile/profile", () => ({
  getProfile: (...args: unknown[]) => getProfile(...args),
}));
vi.mock("@/feed/load-feed-batch", () => ({
  loadFeedBatch: (...args: unknown[]) => loadFeedBatch(...args),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));
vi.mock("@/auth/forms/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));
// The feed body has its own tests. Here it either shows picks at once, or
// stays pending so the loading state is what the page can show.
vi.mock("@/feed/feed", () => ({
  Feed: () => {
    if (feed.mode === "slow") use(new Promise<never>(() => {}));
    return <p>the picks</p>;
  },
}));

import HomePage from "./page";

const USER = { id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  feed.mode = "ready";
  requireUser.mockResolvedValue({ user: USER });
  getProfile.mockResolvedValue(
    ok({ onboardedAt: new Date("2026-11-10T12:00:00.000Z") }),
  );
});
afterEach(cleanup);

describe("HomePage guards (AC-1)", () => {
  it("asks for the live session for /home first", async () => {
    await HomePage();

    expect(requireUser).toHaveBeenCalledWith("/home");
  });

  it("goes no further when the visitor is signed out", async () => {
    requireUser.mockRejectedValue(
      new Error("NEXT_REDIRECT /sign-in?returnTo=%2Fhome"),
    );

    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT /sign-in");

    expect(getProfile).not.toHaveBeenCalled();
    expect(loadFeedBatch).not.toHaveBeenCalled();
  });

  it("reads the profile of the signed in user only", async () => {
    await HomePage();

    expect(getProfile).toHaveBeenCalledWith(fakeDb, { userId: "user-1" });
  });

  it("sends a user who has not finished onboarding to /onboarding, with no recommender call", async () => {
    getProfile.mockResolvedValue(ok({ onboardedAt: null }));

    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT /onboarding");

    expect(redirect).toHaveBeenCalledWith("/onboarding");
    expect(loadFeedBatch).not.toHaveBeenCalled();
  });

  it("sends a user whose record is gone to sign in", async () => {
    getProfile.mockResolvedValue(err({ code: "user_not_found" }));

    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT /sign-in");
  });

  it("throws, with no data in the message, when the profile cannot be read", async () => {
    getProfile.mockResolvedValue(err({ code: "db_unavailable" }));

    const attempt = HomePage();

    await expect(attempt).rejects.toThrow(
      "The home page could not read the profile.",
    );
    await attempt.catch((error: Error) =>
      expect(error.message).not.toContain("user-1"),
    );
  });

  it("makes no recommender call itself: that happens only when the feed body renders", async () => {
    await HomePage();

    expect(loadFeedBatch).not.toHaveBeenCalled();
  });
});

describe("HomePage shell (AC-5)", () => {
  it("shows the header, the one h1 and the picks for a finished user", async () => {
    render(await HomePage());

    expect(screen.getByRole("link", { name: "Moviz" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Your picks" }),
    ).toBeTruthy();
    expect(screen.getByText("the picks")).toBeTruthy();
  });

  it("shows the header, the h1 and the loading state while the picks are not ready", async () => {
    feed.mode = "slow";
    const page = await HomePage();

    await act(async () => {
      render(page);
    });

    expect(
      screen.getByRole("heading", { level: 1, name: "Your picks" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Loading your picks");
    expect(screen.queryByText("the picks")).toBeNull();
  });
});

describe("HomePage without JavaScript (AC-16)", () => {
  const LINE =
    "Moviz needs JavaScript to show your picks. Turn it on and reload the page.";

  it("puts one noscript paragraph directly below the h1 and above the picks", async () => {
    const html = renderToString(await HomePage());

    const h1 = html.indexOf("Your picks</h1>");
    const noscript = html.indexOf("<noscript>");
    const picks = html.indexOf("the picks");
    expect(h1).toBeGreaterThan(-1);
    expect(noscript).toBeGreaterThan(h1);
    expect(picks).toBeGreaterThan(noscript);
    expect(html).toMatch(/<noscript><p[^>]*>Moviz needs JavaScript/);
    expect(html.match(/<noscript>/g)).toHaveLength(1);
    expect(html).toContain(LINE);
  });

  it("keeps the line outside the loading state, above it", async () => {
    feed.mode = "slow";

    const html = renderToString(await HomePage());

    expect(html.indexOf("<noscript>")).toBeGreaterThan(html.indexOf("</h1>"));
    expect(html.indexOf("<noscript>")).toBeLessThan(
      html.indexOf("Loading your picks"),
    );
  });

  it("gives the line no role and no live region", async () => {
    const html = renderToString(await HomePage());

    const noscript = html.slice(
      html.indexOf("<noscript>"),
      html.indexOf("</noscript>"),
    );
    expect(noscript).not.toMatch(/role=|aria-live/);
  });

  it("does not show the line when JavaScript is on", async () => {
    render(await HomePage());

    expect(screen.queryByText(LINE)).toBeNull();
  });
});

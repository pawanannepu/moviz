// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import { axeViolations } from "@/test-support/axe";

// `loadFeedBatch` has its own tests. These tests cover what the page body does
// with each result: the early picks line, the empty state, the in page error
// and the list (spec 0008, AC-4, AC-6, AC-7, AC-13, AC-15).
const loadFeedBatch = vi.fn();
const refresh = vi.fn();
const { fakeDb } = vi.hoisted(() => ({ fakeDb: { name: "fake-db" } }));

vi.mock("@/db/client", () => ({ db: fakeDb }));
vi.mock("./load-feed-batch", () => ({
  loadFeedBatch: (...args: unknown[]) => loadFeedBatch(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
// The list has its own tests: here it only shows what it was given.
vi.mock("./feed-list", () => ({
  FeedList: (props: {
    userId: string;
    initialPicks: unknown[];
    initialDone: boolean;
  }) => (
    <div
      data-testid="feed-list"
      data-user={props.userId}
      data-count={props.initialPicks.length}
      data-done={String(props.initialDone)}
    />
  ),
}));

import { Feed } from "./feed";
import type { FeedPick } from "./types";

const pick = (id: number): FeedPick => ({
  movie: {
    id,
    title: `Movie ${id}`,
    releaseYear: 2000,
    posterPath: null,
    genres: [],
  },
  reason: "Popular with film fans",
});

function batch(count: number, strength: "none" | "thin" | "ok", done = false) {
  return ok({
    picks: Array.from({ length: count }, (_, index) => pick(index + 1)),
    strength,
    done,
  });
}

async function showFeed() {
  return render(await Feed({ userId: "user-1" }));
}

const THIN =
  "Early picks from just a few ratings. They get sharper as Moviz learns your taste.";
const NONE = "These are popular films while Moviz learns your taste.";

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);

describe("Feed picks (AC-2, AC-13)", () => {
  it("makes one batch call for the page, with the signed in user and nothing shown yet", async () => {
    loadFeedBatch.mockResolvedValue(batch(24, "ok"));

    await showFeed();

    expect(loadFeedBatch).toHaveBeenCalledTimes(1);
    expect(loadFeedBatch).toHaveBeenCalledWith(fakeDb, {
      userId: "user-1",
      shown: [],
    });
  });

  it("hands the first batch and the done flag to the list", async () => {
    loadFeedBatch.mockResolvedValue(batch(5, "ok", true));

    await showFeed();

    const list = screen.getByTestId("feed-list");
    expect(list.getAttribute("data-count")).toBe("5");
    expect(list.getAttribute("data-done")).toBe("true");
  });
});

describe("Feed and the feed store (spec 0010, AC-14)", () => {
  it("hands the signed in user's id to the list, which keys the kept list on it", async () => {
    loadFeedBatch.mockResolvedValue(batch(3, "ok"));

    await showFeed();

    expect(screen.getByTestId("feed-list").getAttribute("data-user")).toBe(
      "user-1",
    );
  });
});

describe("Feed early picks line (AC-4)", () => {
  it("shows the thin line above the list for a thin profile", async () => {
    loadFeedBatch.mockResolvedValue(batch(3, "thin"));

    const { container } = await showFeed();

    const line = screen.getByText(THIN);
    const list = screen.getByTestId("feed-list");
    expect(
      line.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(line.closest("a")).toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("shows the popular line for a profile with no taste signal", async () => {
    loadFeedBatch.mockResolvedValue(batch(3, "none"));

    await showFeed();

    expect(screen.getByText(NONE)).toBeTruthy();
    expect(screen.queryByText(THIN)).toBeNull();
  });

  it("shows no line for an ok profile", async () => {
    loadFeedBatch.mockResolvedValue(batch(3, "ok"));

    const { container } = await showFeed();

    expect(container.querySelector("[data-slot=early-picks]")).toBeNull();
  });
});

describe("Feed empty state (AC-4, AC-6)", () => {
  it.each(["none", "thin", "ok"] as const)(
    "shows No picks yet, with no action and no early line, for a %s profile",
    async (strength) => {
      loadFeedBatch.mockResolvedValue(batch(0, strength, true));

      const { container } = await showFeed();

      expect(
        screen.getByRole("heading", { name: "No picks yet" }),
      ).toBeTruthy();
      expect(
        screen.getByText(
          "There are no movies to suggest right now. Check back soon.",
        ),
      ).toBeTruthy();
      expect(container.querySelectorAll("a, button")).toHaveLength(0);
      expect(screen.queryByText(THIN)).toBeNull();
      expect(screen.queryByText(NONE)).toBeNull();
      expect(screen.queryByTestId("feed-list")).toBeNull();
    },
  );

  it("has no WCAG A or AA violations (AC-15)", async () => {
    loadFeedBatch.mockResolvedValue(batch(0, "none", true));

    const { container } = await showFeed();

    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("Feed first load error (AC-7)", () => {
  beforeEach(() => {
    loadFeedBatch.mockResolvedValue(err({ code: "db_unavailable" }));
  });

  it("shows the in page error, with no list and no early line", async () => {
    await showFeed();

    expect(
      screen.getByRole("heading", { name: "We couldn't load your picks." }),
    ).toBeTruthy();
    expect(
      screen.getByText("Check your connection and try again."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByTestId("feed-list")).toBeNull();
    expect(screen.queryByText(THIN)).toBeNull();
    expect(screen.queryByText(NONE)).toBeNull();
  });

  it("has no WCAG A or AA violations (AC-15)", async () => {
    const { container } = await showFeed();

    expect(await axeViolations(container)).toEqual([]);
  });

  it("lets an unexpected throw reach the page error boundary", async () => {
    loadFeedBatch.mockRejectedValue(new Error("a bug"));

    await expect(Feed({ userId: "user-1" })).rejects.toThrow("a bug");
  });
});

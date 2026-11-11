// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spec 0010, AC-14: the signed in layout holds the feed store, above the
// pages, so the kept list outlives a page change.
vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));
vi.mock("@/auth/renew-session", () => ({
  RenewSession: () => <span data-testid="renew-session" />,
}));

import { type FeedStore, useFeedStore } from "@/feed/feed-store";
import ProtectedLayout from "./layout";

/** Every store a page inside the layout was handed, oldest first. */
const seen: FeedStore[] = [];

/** A stand in for a page: it only records the store it gets. */
function Page() {
  seen.push(useFeedStore());
  return null;
}

beforeEach(() => {
  seen.length = 0;
});
afterEach(cleanup);

describe("ProtectedLayout (AC-14)", () => {
  it("renders the page it was given, and still renews the session", () => {
    render(
      <ProtectedLayout>
        <p>the page</p>
      </ProtectedLayout>,
    );

    expect(screen.getByText("the page")).toBeTruthy();
    expect(screen.getByTestId("renew-session")).toBeTruthy();
  });

  it("gives its pages a feed store that really keeps a list", () => {
    render(
      <ProtectedLayout>
        <Page />
      </ProtectedLayout>,
    );
    const store = seen[0];
    const kept = { userId: "user-1", seedIds: [1], picks: [], done: false };

    store.save(kept);
    store.markOpened(1);

    expect(store.read("user-1", [1])).toEqual(kept);
    expect(store.opened).toBe(1);
  });

  it("keeps the same store when the page inside it changes", () => {
    const view = render(
      <ProtectedLayout>
        <Page key="home" />
      </ProtectedLayout>,
    );
    seen[0].save({ userId: "user-1", seedIds: [1], picks: [], done: true });

    view.rerender(
      <ProtectedLayout>
        <Page key="movie" />
      </ProtectedLayout>,
    );

    expect(seen.at(-1)).toBe(seen[0]);
    expect(seen.at(-1)?.read("user-1", [1])?.done).toBe(true);
  });
});

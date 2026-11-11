// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";

// Spec 0010: feed cards link to their movie page (AC-12), and the list keeps
// its place through the feed store (AC-13, AC-14). `feed-list.test.tsx` covers
// Load more itself; this file covers the links and the restore. It is a
// separate file because it replaces `next/link` and needs the store provider.
const loadMoreAction = vi.fn();
const setFeedbackAction = vi.fn();
vi.mock("@/feedback/actions", () => ({
  setFeedbackAction: (...args: unknown[]) => setFeedbackAction(...args),
}));
vi.mock("./actions", () => ({
  loadMoreAction: (...args: unknown[]) => loadMoreAction(...args),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));
// `next/link` only calls `onNavigate` for a navigation inside the app. This
// stand in calls it on a click and keeps what it was given, so the tests can
// see the address, the prefetch setting and the handler.
vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    onNavigate,
    children,
    ...rest
  }: {
    href: string;
    prefetch?: boolean;
    onNavigate?: (event: { preventDefault: () => void }) => void;
    children: ReactNode;
    className?: string;
  }) => (
    <a
      {...rest}
      href={href}
      data-prefetch={String(prefetch)}
      onClick={(event) => {
        event.preventDefault();
        onNavigate?.({ preventDefault: () => {} });
      }}
    >
      {children}
    </a>
  ),
}));

import { FeedList } from "./feed-list";
import { type FeedStore, FeedStoreProvider, useFeedStore } from "./feed-store";
import type { FeedPick } from "./types";

function pick(id: number): FeedPick {
  return {
    movie: {
      id,
      title: `Movie ${id}`,
      releaseYear: 2000,
      posterPath: null,
      genres: ["Drama"],
    },
    reason: `Because you loved Anchor ${id} (1990)`,
    moreLikeThis: false,
  };
}
const picks = (ids: number[]) => ids.map(pick);
const LOAD_MORE = { name: "Load more picks" };

let store!: FeedStore;
function Probe() {
  store = useFeedStore();
  return null;
}

type ListProps = {
  userId?: string;
  ids?: number[];
  done?: boolean;
};

/** The signed in area: the store stays mounted while the feed comes and goes. */
function Area({
  show,
  strict = false,
  ...list
}: ListProps & { show: boolean; strict?: boolean }) {
  const area = (
    <FeedStoreProvider>
      <Probe />
      {show ? (
        <FeedList
          userId={list.userId ?? "user-1"}
          initialPicks={picks(list.ids ?? [1, 2, 3])}
          initialDone={list.done ?? false}
        />
      ) : null}
    </FeedStoreProvider>
  );
  return strict ? <StrictMode>{area}</StrictMode> : area;
}

/** Shows the feed, and gives the test a way to leave it and come back. */
function openFeed(list: ListProps = {}, strict = false) {
  const view = render(<Area show strict={strict} {...list} />);
  return {
    leave: () => view.rerender(<Area show={false} strict={strict} />),
    comeBack: (next: ListProps = list) =>
      view.rerender(<Area show strict={strict} {...next} />),
  };
}

const shownIds = () =>
  screen
    .getAllByRole("listitem")
    .map((item) => Number(item.getAttribute("data-movie-id")));
const cardLink = (id: number) =>
  screen.getByRole("link", { name: `Movie ${id}` });
const press = () => fireEvent.click(screen.getByRole("button", LOAD_MORE));

/** Presses Load more and waits until the list holds `count` picks. */
async function loadTo(count: number) {
  press();
  await waitFor(() => expect(shownIds()).toHaveLength(count));
}

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);

describe("FeedList card links (AC-12)", () => {
  it("links every card to its movie page", () => {
    openFeed({ ids: [3, 1, 2] });

    expect(cardLink(3).getAttribute("href")).toBe("/movie/3");
    expect(cardLink(1).getAttribute("href")).toBe("/movie/1");
    expect(cardLink(2).getAttribute("href")).toBe("/movie/2");
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("puts the movie id on each list item, in order", () => {
    openFeed({ ids: [3, 1, 2] });

    expect(shownIds()).toEqual([3, 1, 2]);
  });

  it("does not prefetch any movie page", () => {
    openFeed();

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("data-prefetch")).toBe("false");
    }
  });

  it("links the picks that Load more adds too", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([4, 5]), done: false }));
    openFeed();

    await loadTo(5);

    expect(cardLink(5).getAttribute("href")).toBe("/movie/5");
  });

  it("remembers the card that was opened when its link navigates", () => {
    openFeed();
    expect(store.opened).toBeNull();

    fireEvent.click(cardLink(2));

    expect(store.opened).toBe(2);
  });
});

describe("FeedList keeps its place (AC-13)", () => {
  it("shows the same picks in the same order after leaving and coming back, loaded batches included", async () => {
    loadMoreAction.mockResolvedValueOnce(
      ok({ picks: picks([4, 5]), done: false }),
    );
    loadMoreAction.mockResolvedValueOnce(
      ok({ picks: picks([6, 7]), done: false }),
    );
    const feed = openFeed();
    await loadTo(5);
    await loadTo(7);

    feed.leave();
    feed.comeBack();

    expect(shownIds()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(screen.getByText("Because you loved Anchor 6 (1990)")).toBeTruthy();
  });

  it("makes no recommender call when it comes back", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([4, 5]), done: false }));
    const feed = openFeed();
    await loadTo(5);
    loadMoreAction.mockClear();

    feed.leave();
    feed.comeBack();

    expect(loadMoreAction).not.toHaveBeenCalled();
  });

  it("comes back ready to load more when the list had not ended", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([4, 5]), done: false }));
    const feed = openFeed();
    await loadTo(5);

    feed.leave();
    feed.comeBack();

    const button = screen.getByRole("button", LOAD_MORE);
    expect(button.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("sends every kept pick as shown on the next Load more", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([4, 5]), done: false }));
    const feed = openFeed();
    await loadTo(5);
    feed.leave();
    feed.comeBack();
    loadMoreAction.mockClear();
    loadMoreAction.mockResolvedValue(ok({ picks: picks([6]), done: true }));

    await loadTo(6);

    expect(loadMoreAction).toHaveBeenCalledWith({ shown: [1, 2, 3, 4, 5] });
  });

  it("comes back with the done line when the list had ended", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([4]), done: true }));
    const feed = openFeed();
    await loadTo(4);
    await screen.findByText("That's all for now.");

    feed.leave();
    feed.comeBack();

    expect(shownIds()).toEqual([1, 2, 3, 4]);
    expect(screen.getByText("That's all for now.")).toBeTruthy();
    expect(screen.queryByRole("button", LOAD_MORE)).toBeNull();
  });

  it("keeps a first batch that was already the last as done", () => {
    const feed = openFeed({ done: true });

    feed.leave();
    feed.comeBack({ done: true });

    expect(screen.getByText("That's all for now.")).toBeTruthy();
  });

  it("comes back ready to press, not stuck, when it was left while loading", async () => {
    loadMoreAction.mockReturnValue(new Promise(() => {}));
    const feed = openFeed();
    press();
    await screen.findByRole("button", { name: "Loading more picks" });

    feed.leave();
    feed.comeBack();

    expect(shownIds()).toEqual([1, 2, 3]);
    const button = screen.getByRole("button", LOAD_MORE);
    expect(button.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("comes back ready to press when it was left after a failed load", async () => {
    loadMoreAction.mockRejectedValue(new Error("down"));
    const feed = openFeed();
    press();
    await screen.findByRole("button", { name: "Try again" });

    feed.leave();
    feed.comeBack();

    expect(screen.getByRole("button", LOAD_MORE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("comes back ready to press when it was left after the session ended", async () => {
    loadMoreAction.mockResolvedValue(err({ code: "unauthenticated" }));
    const feed = openFeed();
    press();
    await screen.findByRole("link", { name: "Sign in" });

    feed.leave();
    feed.comeBack();

    expect(screen.getByRole("button", LOAD_MORE)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});

describe("FeedList focus after a return (AC-13)", () => {
  it("puts focus on the link of the card that was opened", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([4, 5]), done: false }));
    const feed = openFeed();
    await loadTo(5);
    fireEvent.click(cardLink(4));

    feed.leave();
    feed.comeBack();

    expect(document.activeElement).toBe(cardLink(4));
  });

  it("forgets the opened card once focus is back on it", () => {
    const feed = openFeed();
    fireEvent.click(cardLink(2));

    feed.leave();
    feed.comeBack();

    expect(store.opened).toBeNull();
  });

  it("moves focus only once: a second return leaves focus alone", () => {
    const feed = openFeed();
    fireEvent.click(cardLink(2));
    feed.leave();
    feed.comeBack();
    (document.activeElement as HTMLElement).blur();

    feed.leave();
    feed.comeBack();

    expect(document.activeElement).toBe(document.body);
  });

  it("does not move focus when no card was opened", () => {
    const feed = openFeed();

    feed.leave();
    feed.comeBack();

    expect(document.activeElement).toBe(document.body);
  });

  it("does not move focus on a first visit", () => {
    openFeed();

    expect(document.activeElement).toBe(document.body);
  });

  it("restores and focuses the same way in Strict Mode", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([4, 5]), done: false }));
    const feed = openFeed({}, true);
    await loadTo(5);
    fireEvent.click(cardLink(5));

    feed.leave();
    feed.comeBack();

    expect(shownIds()).toEqual([1, 2, 3, 4, 5]);
    expect(document.activeElement).toBe(cardLink(5));
    expect(store.opened).toBeNull();
  });
});

describe("FeedList drops a kept list that is not this one (AC-14)", () => {
  it("shows the fresh first batch to another user", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([4, 5]), done: false }));
    const feed = openFeed();
    await loadTo(5);

    feed.leave();
    feed.comeBack({ userId: "user-2" });

    expect(shownIds()).toEqual([1, 2, 3]);
  });

  it("shows fresh picks when the first batch has other movies, as after an import", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([4, 5]), done: false }));
    const feed = openFeed();
    await loadTo(5);

    feed.leave();
    feed.comeBack({ ids: [9, 2, 3] });

    expect(shownIds()).toEqual([9, 2, 3]);
  });

  it("shows fresh picks when the first batch has the same movies in another order", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([4, 5]), done: false }));
    const feed = openFeed();
    await loadTo(5);

    feed.leave();
    feed.comeBack({ ids: [2, 1, 3] });

    expect(shownIds()).toEqual([2, 1, 3]);
  });

  it("replaces the old kept list with the fresh one", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([4, 5]), done: false }));
    const feed = openFeed();
    await loadTo(5);
    feed.leave();
    feed.comeBack({ ids: [9, 2, 3] });

    feed.leave();
    feed.comeBack({ ids: [1, 2, 3] });

    expect(shownIds()).toEqual([1, 2, 3]);
  });

  it("does not move focus, and forgets the opened card, when the list was not restored", () => {
    const feed = openFeed();
    fireEvent.click(cardLink(2));

    feed.leave();
    feed.comeBack({ ids: [9, 2, 3] });

    expect(document.activeElement).toBe(document.body);
    expect(store.opened).toBeNull();
  });

  it("does not take the done state from a kept list it did not restore", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([4]), done: true }));
    const feed = openFeed();
    await loadTo(4);

    feed.leave();
    feed.comeBack({ ids: [9, 2, 3] });

    expect(screen.getByRole("button", LOAD_MORE)).toBeTruthy();
  });
});

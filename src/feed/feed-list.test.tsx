// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import { axeViolations } from "@/test-support/axe";

// The Server Action has its own tests. Here it is replaced, so these tests
// cover what the list does with each result: the ids it sends, the dedupe, the
// announcement, the end states and the failures (spec 0008, AC-8 to AC-12).
const loadMoreAction = vi.fn();
vi.mock("./actions", () => ({
  loadMoreAction: (...args: unknown[]) => loadMoreAction(...args),
}));

import { FeedList } from "./feed-list";
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
  };
}

const picks = (ids: number[]) => ids.map(pick);
const LOAD_MORE = { name: "Load more picks" };
const SIGN_IN = "/sign-in?returnTo=%2Fhome";

/** A promise a test settles itself, to hold the action mid flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const announcement = () =>
  document.querySelector("p[role=status].sr-only")?.textContent;
const listedIds = () =>
  screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
const press = () => fireEvent.click(screen.getByRole("button", LOAD_MORE));

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);

describe("FeedList first batch (AC-2, AC-3)", () => {
  it("shows every pick in a list with its reason as text, in order", () => {
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([3, 1, 2])}
        initialDone={false}
      />,
    );

    expect(screen.getAllByRole("list")).toHaveLength(1);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("Movie 3");
    expect(items[0].textContent).toContain("Because you loved Anchor 3 (1990)");
    expect(items[1].textContent).toContain("Movie 1");
    expect(items[2].textContent).toContain("Movie 2");
  });

  it("shows a Load more picks button when more may exist", () => {
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1])}
        initialDone={false}
      />,
    );

    expect(screen.getByRole("button", LOAD_MORE)).toBeTruthy();
  });

  it("shows the done line instead of the button when the first batch was the last (AC-9)", () => {
    render(<FeedList userId="user-1" initialPicks={picks([1])} initialDone />);

    expect(screen.getByText("That's all for now.")).toBeTruthy();
    expect(screen.queryByRole("button", LOAD_MORE)).toBeNull();
  });

  it("does not move focus on load when the first batch is already done (AC-9)", () => {
    render(<FeedList userId="user-1" initialPicks={picks([1])} initialDone />);

    expect(document.activeElement).toBe(document.body);
  });

  it("renders the live region empty on mount (AC-8)", () => {
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1])}
        initialDone={false}
      />,
    );

    expect(announcement()).toBe("");
  });
});

describe("FeedList Load more (AC-8, AC-12)", () => {
  it("sends the ids of every pick on the page, and nothing about the user", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: [], done: true }));
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([5, 6, 7])}
        initialDone={false}
      />,
    );

    press();

    await waitFor(() => expect(loadMoreAction).toHaveBeenCalledTimes(1));
    expect(loadMoreAction).toHaveBeenCalledWith({ shown: [5, 6, 7] });
  });

  it("appends the new picks below the old ones and announces the count", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([8, 9]), done: false }));
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1])}
        initialDone={false}
      />,
    );

    press();

    await waitFor(() => expect(announcement()).toBe("2 more picks loaded"));
    const items = listedIds();
    expect(items).toHaveLength(3);
    expect(items[1]).toContain("Movie 8");
    expect(items[2]).toContain("Movie 9");
    expect(screen.getByRole("button", LOAD_MORE)).toBeTruthy();
  });

  it("announces one pick in the singular", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([8]), done: false }));
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1])}
        initialDone={false}
      />,
    );

    press();

    await waitFor(() => expect(announcement()).toBe("1 more pick loaded"));
  });

  it("sends the appended ids too on the next press", async () => {
    loadMoreAction
      .mockResolvedValueOnce(ok({ picks: picks([8, 9]), done: false }))
      .mockResolvedValueOnce(ok({ picks: [], done: true }));
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1])}
        initialDone={false}
      />,
    );

    press();
    await waitFor(() => expect(announcement()).toBe("2 more picks loaded"));
    press();

    await waitFor(() => expect(loadMoreAction).toHaveBeenCalledTimes(2));
    expect(loadMoreAction).toHaveBeenLastCalledWith({ shown: [1, 8, 9] });
  });

  it("drops an incoming pick that is already on the page and counts only the new ones (AC-12)", async () => {
    loadMoreAction.mockResolvedValue(
      ok({ picks: picks([1, 8, 8, 9]), done: false }),
    );
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1, 2])}
        initialDone={false}
      />,
    );

    press();

    await waitFor(() => expect(announcement()).toBe("2 more picks loaded"));
    const items = listedIds();
    expect(items).toHaveLength(4);
    expect(items.filter((text) => text.includes("Movie 1"))).toHaveLength(1);
    expect(items.filter((text) => text.includes("Movie 8"))).toHaveLength(1);
  });

  it("announces nothing when every incoming pick is a repeat (AC-8, AC-12)", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([1, 2]), done: false }));
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1, 2])}
        initialDone={false}
      />,
    );

    press();

    await waitFor(() =>
      expect(screen.getByRole("button", LOAD_MORE)).toBeTruthy(),
    );
    expect(announcement()).toBe("");
    expect(listedIds()).toHaveLength(2);
  });

  it("holds the pending state, ignores a second press and keeps focus on the button (AC-8)", async () => {
    const call = deferred<unknown>();
    loadMoreAction.mockReturnValue(call.promise);
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1])}
        initialDone={false}
      />,
    );
    const button = screen.getByRole("button", LOAD_MORE);
    button.focus();

    fireEvent.click(button);
    const pending = await screen.findByRole("button", {
      name: "Loading more picks",
    });
    fireEvent.click(pending);
    fireEvent.click(pending);

    expect(loadMoreAction).toHaveBeenCalledTimes(1);
    expect(pending.getAttribute("aria-disabled")).toBe("true");
    expect(pending.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(pending);

    await act(async () => call.resolve(ok({ picks: picks([2]), done: false })));
    await waitFor(() => expect(announcement()).toBe("1 more pick loaded"));
    expect(document.activeElement).toBe(screen.getByRole("button", LOAD_MORE));
  });

  it("clears the announcement while it loads, so the same message is read twice in a row", async () => {
    const second = deferred<unknown>();
    loadMoreAction
      .mockResolvedValueOnce(ok({ picks: picks([2]), done: false }))
      .mockReturnValueOnce(second.promise);
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1])}
        initialDone={false}
      />,
    );

    press();
    await waitFor(() => expect(announcement()).toBe("1 more pick loaded"));
    press();

    await waitFor(() => expect(announcement()).toBe(""));
    await act(async () =>
      second.resolve(ok({ picks: picks([3]), done: false })),
    );
    await waitFor(() => expect(announcement()).toBe("1 more pick loaded"));
  });
});

describe("FeedList done (AC-9)", () => {
  it("announces the count, then replaces the button with the done line and moves focus to it", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: picks([2, 3]), done: true }));
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1])}
        initialDone={false}
      />,
    );

    press();

    const line = await screen.findByText("That's all for now.");
    expect(document.activeElement).toBe(line);
    expect(announcement()).toBe("2 more picks loaded");
    expect(screen.queryByRole("button", LOAD_MORE)).toBeNull();
    expect(listedIds()).toHaveLength(3);
  });

  it("goes done with nothing announced when the last batch is empty", async () => {
    loadMoreAction.mockResolvedValue(ok({ picks: [], done: true }));
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1])}
        initialDone={false}
      />,
    );

    press();

    await screen.findByText("That's all for now.");
    expect(announcement()).toBe("");
  });
});

describe("FeedList failures (AC-10)", () => {
  async function failWith(result: unknown) {
    loadMoreAction.mockResolvedValue(result);
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1, 2])}
        initialDone={false}
      />,
    );
    press();
  }

  it.each([
    ["db_unavailable", err({ code: "db_unavailable" })],
    ["invalid_input", err({ code: "invalid_input" })],
  ])(
    "shows the error message and Try again for %s, with focus on it",
    async (_code, result) => {
      await failWith(result);

      const retry = await screen.findByRole("button", { name: "Try again" });
      expect(
        screen.getByText(
          "We couldn't load more picks. Check your connection and try again.",
        ),
      ).toBeTruthy();
      expect(document.activeElement).toBe(retry);
      expect(listedIds()).toHaveLength(2);
    },
  );

  it("treats a call that rejects as a failure and keeps the picks", async () => {
    loadMoreAction.mockRejectedValue(new Error("network down"));
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1, 2])}
        initialDone={false}
      />,
    );

    press();

    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(document.activeElement).toBe(retry);
    expect(listedIds()).toHaveLength(2);
  });

  it("repeats the same call when Try again is pressed, and recovers", async () => {
    loadMoreAction
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(ok({ picks: picks([3]), done: false }));
    render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1, 2])}
        initialDone={false}
      />,
    );
    press();

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => expect(announcement()).toBe("1 more pick loaded"));
    expect(loadMoreAction).toHaveBeenCalledTimes(2);
    expect(loadMoreAction).toHaveBeenLastCalledWith({ shown: [1, 2] });
    expect(listedIds()).toHaveLength(3);
    expect(screen.queryByText(/couldn't load more picks/)).toBeNull();
  });

  it("shows a Sign in link to the sign in page with returnTo for a lost session, with focus on it", async () => {
    await failWith(err({ code: "unauthenticated" }));

    const link = await screen.findByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe(SIGN_IN);
    expect(document.activeElement).toBe(link);
    expect(
      screen.getByText("Your session ended. Sign in to see more picks."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", LOAD_MORE)).toBeNull();
    expect(listedIds()).toHaveLength(2);
  });
});

describe("FeedList accessibility (AC-15)", () => {
  it("has no WCAG A or AA violations when loaded", async () => {
    const { container } = render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1, 2, 3])}
        initialDone={false}
      />,
    );

    expect(await axeViolations(container)).toEqual([]);
  });

  it("has none while a press is pending", async () => {
    loadMoreAction.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1, 2])}
        initialDone={false}
      />,
    );
    press();
    await screen.findByRole("button", { name: "Loading more picks" });

    expect(await axeViolations(container)).toEqual([]);
  });

  it("has none after a failure", async () => {
    loadMoreAction.mockRejectedValue(new Error("down"));
    const { container } = render(
      <FeedList
        userId="user-1"
        initialPicks={picks([1, 2])}
        initialDone={false}
      />,
    );
    press();
    await screen.findByRole("button", { name: "Try again" });

    expect(await axeViolations(container)).toEqual([]);
  });

  it("has none once the feed is done", async () => {
    const { container } = render(
      <FeedList userId="user-1" initialPicks={picks([1, 2])} initialDone />,
    );

    expect(await axeViolations(container)).toEqual([]);
  });
});

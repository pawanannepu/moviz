// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import { axeViolations } from "@/test-support/axe";

// The Server Action has its own tests. Here it is replaced, so these tests
// cover what the controls do with each result: names, pressed state, the
// Hidden line, pending, failures and focus (spec 0011, AC-1 to AC-3, AC-5,
// AC-11, AC-12).
const setFeedbackAction = vi.fn();
vi.mock("./actions", () => ({
  setFeedbackAction: (...args: unknown[]) => setFeedbackAction(...args),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/movie/42" }));

import type { FeedbackKind } from "./feedback";
import { FeedbackControls } from "./feedback-controls";

const MOVIE = { id: 42, title: "Heat" };
const onAnnounce = vi.fn();
const onSaved = vi.fn();

/** A parent that owns `kind`, as the feed and the movie page do. */
function Harness({
  initial = null,
  focusOnMount,
}: {
  initial?: FeedbackKind | null;
  focusOnMount?: boolean;
}) {
  const [kind, setKind] = useState(initial);
  return (
    <FeedbackControls
      movie={MOVIE}
      kind={kind}
      onSaved={(next) => {
        onSaved(next);
        setKind(next);
      }}
      onAnnounce={onAnnounce}
      focusOnMount={focusOnMount}
    />
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const moreLike = () =>
  screen.getByRole("button", { name: "More like this: Heat" });
const notInterested = () =>
  screen.getByRole("button", { name: "Not interested in Heat" });
const undo = () => screen.getByRole("button", { name: "Undo hiding Heat" });

beforeEach(() => {
  vi.resetAllMocks();
  setFeedbackAction.mockImplementation(async ({ kind }: { kind: unknown }) =>
    ok({ kind }),
  );
});
afterEach(cleanup);

describe("FeedbackControls buttons (AC-1)", () => {
  it("shows two buttons whose names carry the title and start with the visible label", () => {
    render(<Harness />);

    expect(moreLike().textContent).toBe("More like this");
    expect(notInterested().textContent).toBe("Not interested");
    expect(moreLike().getAttribute("aria-pressed")).toBe("false");
  });

  it("sits above a stretched link so a press never opens the card", () => {
    const { container } = render(<Harness />);

    const root = container.querySelector('[data-slot="feedback-controls"]');
    expect(root?.className).toContain("relative");
    expect(root?.className).toContain("z-10");
  });

  it("has no accessibility violations, shown or hidden", async () => {
    const shown = render(<Harness />);
    expect(await axeViolations(shown.container)).toEqual([]);
    cleanup();
    const hidden = render(<Harness initial="not_interested" />);
    expect(await axeViolations(hidden.container)).toEqual([]);
  });
});

describe("FeedbackControls Not interested and Undo (AC-2, AC-3, AC-11)", () => {
  it("saves not_interested, then shows the Hidden line and Undo with focus on Undo", async () => {
    render(<Harness />);

    await act(async () => fireEvent.click(notInterested()));

    expect(setFeedbackAction).toHaveBeenCalledWith({
      movieId: 42,
      kind: "not_interested",
    });
    expect(screen.getByText("Hidden from your picks.")).toBeTruthy();
    expect(document.activeElement).toBe(undo());
    expect(onAnnounce).toHaveBeenCalledWith("Heat hidden from your picks");
    expect(onSaved).toHaveBeenCalledWith("not_interested");
    expect(screen.queryByRole("button", { name: /More like this/ })).toBeNull();
  });

  it("clears on Undo, shows the buttons again unpressed and focuses Not interested", async () => {
    render(<Harness initial="not_interested" />);

    await act(async () => fireEvent.click(undo()));

    expect(setFeedbackAction).toHaveBeenCalledWith({ movieId: 42, kind: null });
    expect(screen.queryByText("Hidden from your picks.")).toBeNull();
    expect(moreLike().getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(notInterested());
    expect(onAnnounce).toHaveBeenCalledWith("Heat is back in your picks");
  });

  it("focuses Undo on mount when asked, for the feed's freshly swapped cell", () => {
    render(<Harness initial="not_interested" focusOnMount />);

    expect(document.activeElement).toBe(undo());
  });

  it("focuses Not interested on mount when asked and shown", () => {
    render(<Harness focusOnMount />);

    expect(document.activeElement).toBe(notInterested());
  });

  it("does not move focus on mount by default", () => {
    render(<Harness initial="not_interested" />);

    expect(document.activeElement).toBe(document.body);
  });
});

describe("FeedbackControls More like this (AC-5)", () => {
  it("presses on set, keeps the label and focus, and announces", async () => {
    render(<Harness />);
    moreLike().focus();

    await act(async () => fireEvent.click(moreLike()));

    expect(setFeedbackAction).toHaveBeenCalledWith({
      movieId: 42,
      kind: "more_like_this",
    });
    expect(moreLike().getAttribute("aria-pressed")).toBe("true");
    expect(moreLike().textContent).toBe("More like this");
    expect(document.activeElement).toBe(moreLike());
    expect(onAnnounce).toHaveBeenCalledWith(
      "More like Heat on your next picks",
    );
  });

  it("shows a different icon when pressed, so the state does not rely on colour", () => {
    const off = render(<Harness />);
    const offIcon = off.container
      .querySelector("button svg")
      ?.getAttribute("class");
    cleanup();
    const on = render(<Harness initial="more_like_this" />);
    const onIcon = on.container
      .querySelector("button svg")
      ?.getAttribute("class");

    expect(offIcon).not.toBe(onIcon);
  });

  it("clears on a second press and announces the removal", async () => {
    render(<Harness initial="more_like_this" />);

    await act(async () => fireEvent.click(moreLike()));

    expect(setFeedbackAction).toHaveBeenCalledWith({ movieId: 42, kind: null });
    expect(moreLike().getAttribute("aria-pressed")).toBe("false");
    expect(onAnnounce).toHaveBeenCalledWith("Removed more like Heat");
  });
});

describe("FeedbackControls pending and failures (AC-12)", () => {
  it("marks both buttons aria-disabled while a save runs and ignores another press", async () => {
    const call = deferred<unknown>();
    setFeedbackAction.mockReturnValue(call.promise);
    render(<Harness />);

    fireEvent.click(moreLike());
    await waitFor(() =>
      expect(moreLike().getAttribute("aria-disabled")).toBe("true"),
    );
    expect(notInterested().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(moreLike());
    fireEvent.click(notInterested());
    expect(setFeedbackAction).toHaveBeenCalledTimes(1);

    await act(async () => call.resolve(ok({ kind: "more_like_this" })));
    expect(moreLike().getAttribute("aria-disabled")).toBeNull();
    expect(moreLike().getAttribute("aria-pressed")).toBe("true");
  });

  it.each([
    [
      "an error result",
      () =>
        setFeedbackAction.mockResolvedValue(err({ code: "db_unavailable" })),
    ],
    [
      "a thrown call",
      () => setFeedbackAction.mockRejectedValue(new Error("network")),
    ],
  ])(
    "on %s changes nothing, shows the inline line and keeps focus",
    async (_, arrange) => {
      arrange();
      render(<Harness />);
      notInterested().focus();

      await act(async () => fireEvent.click(notInterested()));

      expect(screen.getByRole("alert").textContent).toBe(
        "Could not save. Try again.",
      );
      expect(screen.queryByText("Hidden from your picks.")).toBeNull();
      expect(document.activeElement).toBe(notInterested());
      expect(onSaved).not.toHaveBeenCalled();
      expect(onAnnounce).not.toHaveBeenCalled();
    },
  );

  it("clears the error line after a later save works", async () => {
    setFeedbackAction.mockResolvedValueOnce(err({ code: "db_unavailable" }));
    render(<Harness />);
    await act(async () => fireEvent.click(moreLike()));
    expect(screen.getByRole("alert")).toBeTruthy();

    await act(async () => fireEvent.click(moreLike()));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(moreLike().getAttribute("aria-pressed")).toBe("true");
  });

  it("on unauthenticated shows a Sign in again link back to this page and focuses it", async () => {
    setFeedbackAction.mockResolvedValue(err({ code: "unauthenticated" }));
    render(<Harness />);

    await act(async () => fireEvent.click(moreLike()));

    const link = screen.getByRole("link", { name: "Sign in again" });
    expect(screen.getByRole("alert").textContent).toContain(
      "Your session ended.",
    );
    expect(link.getAttribute("href")).toBe("/sign-in?returnTo=%2Fmovie%2F42");
    expect(document.activeElement).toBe(link);
    expect(moreLike().getAttribute("aria-pressed")).toBe("false");
  });
});

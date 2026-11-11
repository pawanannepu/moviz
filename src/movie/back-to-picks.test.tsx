// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test-support/axe";

// Spec 0010, AC-15: "Back to picks" is always a real link to /home. It steps
// back in history only when its movie is the one last opened from the feed.
const { nav } = vi.hoisted(() => ({
  nav: { pathname: "/home", went: [] as string[] },
}));
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back }),
  usePathname: () => nav.pathname,
}));
// `next/link` only calls `onNavigate` for a navigation inside the app, and
// lets the handler cancel it. This stand in does the same for a click, and
// records where the click went: the address, or "cancelled".
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
        let cancelled = false;
        onNavigate?.({
          preventDefault: () => {
            cancelled = true;
          },
        });
        nav.went.push(cancelled ? "cancelled" : href);
      }}
    >
      {children}
    </a>
  ),
}));

import { FeedStoreProvider, useFeedStore } from "@/feed/feed-store";
import { BackToPicks } from "./back-to-picks";

/** A button that marks a movie as opened from the feed, as a card click does. */
function MarkOpened({ movieId }: { movieId: number }) {
  const store = useFeedStore();
  return (
    <button type="button" onClick={() => store.markOpened(movieId)}>
      mark {movieId}
    </button>
  );
}

function renderOnMoviePage(movieId: number | undefined, opened?: number) {
  nav.pathname = opened === undefined ? "/movie/42" : `/movie/${opened}`;
  const view = render(
    <FeedStoreProvider>
      {opened === undefined ? null : <MarkOpened movieId={opened} />}
      <BackToPicks movieId={movieId} />
    </FeedStoreProvider>,
  );
  if (opened !== undefined) {
    fireEvent.click(screen.getByRole("button", { name: `mark ${opened}` }));
  }
  return view;
}

const link = () => screen.getByRole("link", { name: "Back to picks" });

beforeEach(() => {
  vi.clearAllMocks();
  nav.pathname = "/home";
  nav.went = [];
});
afterEach(cleanup);

describe("BackToPicks link (AC-15)", () => {
  it("is a real link to /home, named Back to picks", () => {
    renderOnMoviePage(42);

    expect(link().getAttribute("href")).toBe("/home");
    expect(link().tagName).toBe("A");
  });

  it("does not prefetch the feed", () => {
    renderOnMoviePage(42);

    expect(link().getAttribute("data-prefetch")).toBe("false");
  });

  it("hides its arrow from screen readers", () => {
    renderOnMoviePage(42);

    expect(link().querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("has no WCAG A or AA violations", async () => {
    const { container } = renderOnMoviePage(42);

    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("BackToPicks after opening from the feed (AC-15)", () => {
  it("goes back one step in history when its movie is the one that was opened", () => {
    renderOnMoviePage(42, 42);

    fireEvent.click(link());

    expect(back).toHaveBeenCalledTimes(1);
    expect(nav.went).toEqual(["cancelled"]);
  });

  it("checks what was opened at the time of the click, not when it rendered", () => {
    nav.pathname = "/movie/42";
    render(
      <FeedStoreProvider>
        <MarkOpened movieId={42} />
        <BackToPicks movieId={42} />
      </FeedStoreProvider>,
    );

    fireEvent.click(link());
    expect(back).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "mark 42" }));
    fireEvent.click(link());

    expect(back).toHaveBeenCalledTimes(1);
    expect(nav.went).toEqual(["/home", "cancelled"]);
  });
});

describe("BackToPicks as a plain link (AC-15)", () => {
  it("navigates to /home on a direct visit, when nothing was opened", () => {
    renderOnMoviePage(42);

    fireEvent.click(link());

    expect(back).not.toHaveBeenCalled();
    expect(nav.went).toEqual(["/home"]);
  });

  it("navigates to /home when another movie was the one opened", () => {
    nav.pathname = "/movie/7";
    render(
      <FeedStoreProvider>
        <MarkOpened movieId={7} />
        <BackToPicks movieId={42} />
      </FeedStoreProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "mark 7" }));

    fireEvent.click(link());

    expect(back).not.toHaveBeenCalled();
    expect(nav.went).toEqual(["/home"]);
  });

  it("navigates to /home with no movie id, as the not found and error pages use it, even when a movie was opened", () => {
    renderOnMoviePage(undefined, 42);

    fireEvent.click(link());

    expect(back).not.toHaveBeenCalled();
    expect(nav.went).toEqual(["/home"]);
  });

  it("navigates to /home after a visit to another page in between forgot the opened movie", () => {
    const view = renderOnMoviePage(42, 42);
    const tree = (
      <FeedStoreProvider>
        <MarkOpened movieId={42} />
        <BackToPicks movieId={42} />
      </FeedStoreProvider>
    );
    nav.pathname = "/import";
    view.rerender(tree);
    nav.pathname = "/movie/42";
    view.rerender(tree);

    fireEvent.click(link());

    expect(back).not.toHaveBeenCalled();
    expect(nav.went).toEqual(["/home"]);
  });

  it("works with no feed store around it, as on the design page", () => {
    render(<BackToPicks movieId={42} />);

    fireEvent.click(link());

    expect(back).not.toHaveBeenCalled();
    expect(nav.went).toEqual(["/home"]);
  });
});

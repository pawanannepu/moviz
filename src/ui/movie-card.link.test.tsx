// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Spec 0010, AC-12: a card's link never prefetches, and it tells its owner
// when it starts a navigation inside the app. `movie-card.test.tsx` covers the
// card itself; this file replaces `next/link` to see what the card hands it.
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

import { FeedItem } from "./feed-item";
import { MovieCard, type MovieCardMovie } from "./movie-card";

const heat: MovieCardMovie = {
  id: 1,
  title: "Heat",
  releaseYear: 1995,
  posterPath: null,
  genres: ["Crime", "Drama"],
};

afterEach(cleanup);

describe("MovieCard link (AC-12)", () => {
  it("turns prefetch off on its link", () => {
    render(<MovieCard movie={heat} href="/movie/1" />);

    expect(
      screen.getByRole("link", { name: "Heat" }).getAttribute("data-prefetch"),
    ).toBe("false");
  });

  it("has no prop that turns prefetch back on", () => {
    const props = {
      movie: heat,
      href: "/movie/1",
      prefetch: true,
    } as Parameters<typeof MovieCard>[0];
    render(<MovieCard {...props} />);

    expect(
      screen.getByRole("link", { name: "Heat" }).getAttribute("data-prefetch"),
    ).toBe("false");
  });

  it("calls onNavigate when the link navigates", () => {
    const onNavigate = vi.fn();
    render(<MovieCard movie={heat} href="/movie/1" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("link", { name: "Heat" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("navigates without an onNavigate handler", () => {
    render(<MovieCard movie={heat} href="/movie/1" />);

    expect(() =>
      fireEvent.click(screen.getByRole("link", { name: "Heat" })),
    ).not.toThrow();
  });

  it("keeps the title as the link, with the address it was given", () => {
    render(<MovieCard movie={heat} href="/movie/1" />);

    const link = screen.getByRole("link", { name: "Heat" });
    expect(link.getAttribute("href")).toBe("/movie/1");
    expect(link.closest("h3")).not.toBeNull();
  });
});

describe("FeedItem link (AC-12)", () => {
  it("hands the address and onNavigate through to the card", () => {
    const onNavigate = vi.fn();
    render(
      <FeedItem
        movie={heat}
        reason="Because you loved Collateral (2004)"
        href="/movie/1"
        onNavigate={onNavigate}
      />,
    );
    const link = screen.getByRole("link", { name: "Heat" });

    fireEvent.click(link);

    expect(link.getAttribute("href")).toBe("/movie/1");
    expect(link.getAttribute("data-prefetch")).toBe("false");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

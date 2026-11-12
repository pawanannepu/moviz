// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FeedItem } from "./feed-item";
import { MovieCard, type MovieCardMovie } from "./movie-card";
import { movieMeta } from "./movie-meta";

const IMAGE_PROPERTIES = ["complete", "naturalWidth"] as const;
const originalDescriptors = IMAGE_PROPERTIES.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, name),
);

/** Sets what the browser reports for every image: finished loading, and its width. */
function stubImage(complete: boolean, naturalWidth: number) {
  Object.defineProperty(HTMLImageElement.prototype, "complete", {
    configurable: true,
    get: () => complete,
  });
  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
    configurable: true,
    get: () => naturalWidth,
  });
}

// A real browser reports an image that is still loading as not complete.
beforeEach(() => stubImage(false, 0));
afterEach(() => {
  cleanup();
  IMAGE_PROPERTIES.forEach((name, index) => {
    const descriptor = originalDescriptors[index];
    if (descriptor) {
      Object.defineProperty(HTMLImageElement.prototype, name, descriptor);
    } else {
      Reflect.deleteProperty(HTMLImageElement.prototype, name);
    }
  });
});

const heat: MovieCardMovie = {
  id: 1,
  title: "Heat",
  releaseYear: 1995,
  posterPath: "/heat.jpg",
  genres: ["Action", "Crime", "Drama"],
};

describe("movieMeta (AC-8)", () => {
  it("shows the year and the first two genres", () => {
    expect(movieMeta(heat)).toBe("1995, Action, Crime");
  });

  it("drops a missing year", () => {
    expect(movieMeta({ releaseYear: null, genres: ["Crime"] })).toBe("Crime");
  });

  it("drops missing genres", () => {
    expect(movieMeta({ releaseYear: 1995, genres: [] })).toBe("1995");
  });

  it("is empty when there is nothing to show", () => {
    expect(movieMeta({ releaseYear: null, genres: [] })).toBe("");
  });
});

describe("MovieCard (AC-8)", () => {
  it("shows the poster at w342 with its alt text, the title and the meta line", () => {
    render(<MovieCard movie={heat} />);
    const poster = screen.getByRole("img", { name: "Poster for Heat" });

    expect(poster.getAttribute("src")).toBe(
      "https://image.tmdb.org/t/p/w342/heat.jpg",
    );
    expect(screen.getByRole("heading", { name: "Heat" })).toBeTruthy();
    expect(screen.getByText("1995, Action, Crime")).toBeTruthy();
  });

  it("uses the larger poster size when asked", () => {
    render(<MovieCard movie={heat} posterSize="w500" />);

    expect(
      screen.getByRole("img", { name: "Poster for Heat" }).getAttribute("src"),
    ).toBe("https://image.tmdb.org/t/p/w500/heat.jpg");
  });

  it("shows no meta line when the movie has no year and no genres", () => {
    const { container } = render(
      <MovieCard movie={{ ...heat, releaseYear: null, genres: [] }} />,
    );

    expect(screen.getByRole("heading", { name: "Heat" })).toBeTruthy();
    expect(container.textContent).toBe("Heat");
  });

  it("shows a title frame when the movie has no poster", () => {
    const { container } = render(
      <MovieCard movie={{ ...heat, posterPath: null }} />,
    );

    expect(screen.queryByRole("img")).toBeNull();
    expect(
      container.querySelector('[data-slot="poster-fallback"]')?.textContent,
    ).toBe("Heat");
  });

  it("shows the title frame when the poster fails to load", () => {
    const { container } = render(<MovieCard movie={heat} />);

    fireEvent.error(screen.getByRole("img", { name: "Poster for Heat" }));

    expect(screen.queryByRole("img")).toBeNull();
    expect(
      container.querySelector('[data-slot="poster-fallback"]')?.textContent,
    ).toBe("Heat");
  });

  it("shows the title frame when the poster already failed before the page loaded", () => {
    // The browser finished loading (`complete`) but got no pixels (width 0).
    stubImage(true, 0);

    const { container } = render(<MovieCard movie={heat} />);

    expect(
      container.querySelector('[data-slot="poster-fallback"]'),
    ).not.toBeNull();
  });

  it("keeps the poster while the image is still loading", () => {
    stubImage(false, 0);

    render(<MovieCard movie={heat} />);

    expect(screen.getByRole("img", { name: "Poster for Heat" })).toBeTruthy();
  });

  it("keeps the order poster, reason, title, meta", () => {
    const { container } = render(
      <MovieCard movie={heat} reason="Because you rated Heat highly." />,
    );
    const text = container.innerHTML;

    expect(text.indexOf("<img")).toBeLessThan(
      text.indexOf("Because you rated"),
    );
    expect(text.indexOf("Because you rated")).toBeLessThan(text.indexOf("<h3"));
    expect(text.indexOf("<h3")).toBeLessThan(text.indexOf("1995, Action"));
  });

  it("makes the title a link that covers the card when it has an href", () => {
    render(<MovieCard movie={heat} href="/movies/1" />);
    const link = screen.getByRole("link", { name: "Heat" });

    expect(link.getAttribute("href")).toBe("/movies/1");
    expect(link.className).toContain("after:absolute");
    expect(link.className).toContain("after:inset-0");
  });

  it("has no link without an href", () => {
    render(<MovieCard movie={heat} />);

    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("MovieCard controls slot (spec 0011, AC-1)", () => {
  it("renders the controls inside the card, after the title and meta line", () => {
    const { container } = render(
      <MovieCard
        movie={heat}
        href="/movie/1"
        controls={<button type="button">Not interested in Heat</button>}
      />,
    );

    const card = container.querySelector('[data-slot="movie-card"]');
    const button = screen.getByRole("button", {
      name: "Not interested in Heat",
    });
    const meta = screen.getByText("1995, Action, Crime");
    expect(card?.contains(button)).toBe(true);
    expect(
      meta.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Heat" }).contains(button)).toBe(
      false,
    );
  });

  it("renders nothing extra without controls", () => {
    render(<MovieCard movie={heat} />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("FeedItem (AC-9)", () => {
  it("shows the reason as real text in the subtitle bar", () => {
    const { container } = render(
      <FeedItem movie={heat} reason="Because you rated Heat highly." />,
    );
    const bar = container.querySelector('[data-slot="subtitle-bar"]');

    expect(bar?.textContent).toBe("Because you rated Heat highly.");
  });

  it("uses the w500 poster", () => {
    render(<FeedItem movie={heat} reason="Because you rated Heat highly." />);

    expect(
      screen.getByRole("img", { name: "Poster for Heat" }).getAttribute("src"),
    ).toContain("/w500/");
  });

  it("shows a 200 character reason in full, with nothing cut off", () => {
    const reason =
      `${"Because you loved long, patient crime films. ".repeat(5)}`.slice(
        0,
        200,
      );
    const { container } = render(<FeedItem movie={heat} reason={reason} />);
    const bar = container.querySelector('[data-slot="subtitle-bar"]');

    expect(reason).toHaveLength(200);
    expect(bar?.textContent).toBe(reason);
    expect(bar?.className).not.toMatch(/truncate|line-clamp|overflow-hidden/);
  });
});

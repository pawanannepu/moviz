// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test-support/axe";

// The view can also show the watchlist controls, whose Server Actions reach
// the database. They are a boundary, so they are replaced here.
vi.mock("@/feedback/actions", () => ({ setFeedbackAction: vi.fn() }));
vi.mock("@/watchlist/actions", () => ({
  addToWatchlistAction: vi.fn(),
  removeFromWatchlistAction: vi.fn(),
  rateMovieAction: vi.fn(),
}));

import { type MovieDetailMovie, MovieDetailView } from "./movie-detail-view";

// Spec 0010: what one movie page shows and in which order (AC-4 to AC-8), and
// that it is accessible with and without a reason (AC-18).

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

const person = (personId: number, name: string) => ({
  personId,
  name,
  profilePath: null,
});

const heat: MovieDetailMovie = {
  title: "Heat",
  releaseYear: 1995,
  runtimeMinutes: 170,
  genres: ["Crime", "Drama"],
  tagline: "A Los Angeles crime saga.",
  overview: "A detective hunts a crew of career thieves.",
  posterPath: "/heat.jpg",
  directors: [person(1, "Michael Mann")],
  cast: [
    { ...person(2, "Al Pacino"), characterName: "Lt. Vincent Hanna" },
    { ...person(3, "Robert De Niro"), characterName: "Neil McCauley" },
  ],
};

const bare: MovieDetailMovie = {
  title: "A film with nothing on file",
  releaseYear: null,
  runtimeMinutes: null,
  genres: [],
  tagline: null,
  overview: null,
  posterPath: null,
  directors: [],
  cast: [],
};

const REASON = "Because you loved Collateral (2004)";
const slot = (container: HTMLElement, name: string) =>
  container.querySelector(`[data-slot="${name}"]`);

/** True when `first` comes before `second` in the document. */
const before = (first: Element | null, second: Element | null) =>
  Boolean(
    first &&
      second &&
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

describe("MovieDetailView content (AC-4)", () => {
  it("shows the title as the one h1", () => {
    render(<MovieDetailView movie={heat} reason={REASON} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Heat" }),
    ).toBeTruthy();
  });

  it("orders the parts: poster, reason, title, meta, tagline, synopsis, director, cast", () => {
    const { container } = render(
      <MovieDetailView movie={heat} reason={REASON} />,
    );
    const parts = [
      screen.getByRole("img", { name: "Poster for Heat" }),
      slot(container, "subtitle-bar"),
      screen.getByRole("heading", { level: 1 }),
      slot(container, "movie-meta"),
      slot(container, "movie-tagline"),
      slot(container, "movie-overview"),
      slot(container, "movie-directors"),
      slot(container, "movie-cast"),
    ];

    for (const part of parts) expect(part).not.toBeNull();
    for (let index = 0; index < parts.length - 1; index++) {
      expect(before(parts[index], parts[index + 1])).toBe(true);
    }
  });

  it("shows the poster at w500 with its alt text, marked as the important image", () => {
    render(<MovieDetailView movie={heat} reason={null} />);

    const poster = screen.getByRole("img", { name: "Poster for Heat" });
    expect(poster.getAttribute("src")).toBe(
      "https://image.tmdb.org/t/p/w500/heat.jpg",
    );
    expect(poster.getAttribute("width")).toBe("500");
    expect(poster.getAttribute("height")).toBe("750");
    expect(poster.getAttribute("fetchpriority")).toBe("high");
  });

  it("shows the tagline and the synopsis as text", () => {
    render(<MovieDetailView movie={heat} reason={null} />);

    expect(screen.getByText("A Los Angeles crime saga.")).toBeTruthy();
    expect(
      screen.getByText("A detective hunts a crew of career thieves."),
    ).toBeTruthy();
  });

  it("shows a movie with no poster in the dark title frame, not as missing (AC-3)", () => {
    const { container } = render(
      <MovieDetailView movie={{ ...heat, posterPath: null }} reason={null} />,
    );

    expect(slot(container, "poster-fallback")?.textContent).toBe("Heat");
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Heat" }),
    ).toBeTruthy();
  });
});

describe("MovieDetailView missing facts (AC-4, AC-5)", () => {
  it("leaves every missing part out, with no placeholder and no empty heading", () => {
    const { container } = render(
      <MovieDetailView movie={bare} reason={null} />,
    );

    for (const name of [
      "movie-meta",
      "movie-tagline",
      "movie-overview",
      "movie-directors",
      "movie-cast",
      "subtitle-bar",
    ]) {
      expect(slot(container, name)).toBeNull();
    }
    expect(screen.queryByRole("heading", { name: "Cast" })).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it.each([
    ["an empty tagline", { tagline: "" }, "movie-tagline"],
    ["a tagline of spaces", { tagline: "   " }, "movie-tagline"],
    ["an empty synopsis", { overview: "" }, "movie-overview"],
    ["a synopsis of spaces", { overview: "  \n " }, "movie-overview"],
  ])("leaves out %s", (_name, change, name) => {
    const { container } = render(
      <MovieDetailView movie={{ ...heat, ...change }} reason={null} />,
    );

    expect(slot(container, name)).toBeNull();
  });

  it("still shows the other parts when one is missing", () => {
    const { container } = render(
      <MovieDetailView movie={{ ...heat, tagline: null }} reason={null} />,
    );

    expect(slot(container, "movie-meta")).not.toBeNull();
    expect(slot(container, "movie-overview")).not.toBeNull();
    expect(slot(container, "movie-cast")).not.toBeNull();
  });
});

describe("MovieDetailView meta line (AC-5)", () => {
  it("reads year, runtime, then every genre", () => {
    const { container } = render(
      <MovieDetailView movie={heat} reason={null} />,
    );

    expect(slot(container, "movie-meta")?.textContent).toBe(
      "1995, 2h 50m, Crime, Drama",
    );
  });

  it("drops the parts that are missing", () => {
    const { container } = render(
      <MovieDetailView
        movie={{ ...heat, releaseYear: null, runtimeMinutes: 0 }}
        reason={null}
      />,
    );

    expect(slot(container, "movie-meta")?.textContent).toBe("Crime, Drama");
  });
});

describe("MovieDetailView director and cast (AC-6)", () => {
  it("reads Directed by {name}", () => {
    const { container } = render(
      <MovieDetailView movie={heat} reason={null} />,
    );

    expect(slot(container, "movie-directors")?.textContent).toBe(
      "Directed by Michael Mann",
    );
  });

  it("joins three directors in billing order", () => {
    const { container } = render(
      <MovieDetailView
        movie={{
          ...heat,
          directors: [person(1, "A"), person(2, "B"), person(3, "C")],
        }}
        reason={null}
      />,
    );

    expect(slot(container, "movie-directors")?.textContent).toBe(
      "Directed by A, B, and C",
    );
  });

  it("lists the cast as a real list under an h2 named Cast", () => {
    render(<MovieDetailView movie={heat} reason={null} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Cast" }),
    ).toBeTruthy();
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Al Pacino as Lt. Vincent Hanna",
      "Robert De Niro as Neil McCauley",
    ]);
  });

  it("shows the first 8 of 20 cast members, in billing order", () => {
    const cast = Array.from({ length: 20 }, (_, index) => ({
      ...person(100 + index, `Actor ${index + 1}`),
      characterName: `Role ${index + 1}`,
    }));
    render(<MovieDetailView movie={{ ...heat, cast }} reason={null} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(8);
    expect(rows[0].textContent).toBe("Actor 1 as Role 1");
    expect(rows[7].textContent).toBe("Actor 8 as Role 8");
    expect(screen.queryByText(/Actor 9/)).toBeNull();
  });

  it.each([
    ["null", null],
    ["blank", "   "],
  ])(
    "shows the name alone when the character is %s",
    (_name, characterName) => {
      render(
        <MovieDetailView
          movie={{
            ...heat,
            cast: [{ ...person(2, "Al Pacino"), characterName }],
          }}
          reason={null}
        />,
      );

      expect(screen.getByRole("listitem").textContent).toBe("Al Pacino");
    },
  );

  it("has no photos and no control to show more", () => {
    const cast = Array.from({ length: 20 }, (_, index) => ({
      ...person(100 + index, `Actor ${index + 1}`),
      characterName: null,
    }));
    render(<MovieDetailView movie={{ ...heat, cast }} reason={null} />);

    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("MovieDetailView reason (AC-8)", () => {
  it("shows the reason as real text in the subtitle bar on the poster", () => {
    const { container } = render(
      <MovieDetailView movie={heat} reason={REASON} />,
    );

    const bar = slot(container, "subtitle-bar");
    expect(bar?.textContent).toBe(REASON);
    expect(bar?.tagName).toBe("P");
    // The bar sits in the poster frame, with the poster.
    expect(bar?.parentElement?.querySelector("img")).not.toBeNull();
  });

  it("shows a long reason in full", () => {
    const long = `Because you loved ${"a very long title ".repeat(12)}(1995)`;
    const { container } = render(
      <MovieDetailView movie={heat} reason={long} />,
    );

    expect(slot(container, "subtitle-bar")?.textContent).toBe(long);
  });

  it("is not wrapped in the feed's reveal, so the bar never wipes in", () => {
    const { container } = render(
      <MovieDetailView movie={heat} reason={REASON} />,
    );

    expect(container.querySelector("[data-reveal]")).toBeNull();
    expect(
      slot(container, "subtitle-bar")?.closest("[data-reveal]"),
    ).toBeNull();
  });

  it("has no bar and no other text in its place when there is no reason", () => {
    const { container } = render(
      <MovieDetailView movie={heat} reason={null} />,
    );

    expect(slot(container, "subtitle-bar")).toBeNull();
    expect(container.textContent).not.toContain("Because");
    expect(container.textContent).not.toContain("Popular");
    // The poster frame holds the poster and nothing else.
    const frame = screen.getByRole("img").parentElement;
    expect(frame?.textContent).toBe("");
  });

  it("shows the reason on the title frame when the movie has no poster", () => {
    const { container } = render(
      <MovieDetailView movie={{ ...heat, posterPath: null }} reason={REASON} />,
    );

    expect(slot(container, "subtitle-bar")?.textContent).toBe(REASON);
  });
});

describe("MovieDetailView heading level", () => {
  it("uses h3 for the title and h4 for the cast on the design page, and no h1", () => {
    render(<MovieDetailView movie={heat} reason={null} headingLevel={3} />);

    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(
      screen.getByRole("heading", { level: 3, name: "Heat" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 4, name: "Cast" }),
    ).toBeTruthy();
  });
});

describe("MovieDetailView accessibility (AC-18)", () => {
  it.each([
    ["with a reason", heat, REASON],
    ["without a reason", heat, null],
    ["with no poster", { ...heat, posterPath: null }, REASON],
    ["with nothing but a title", bare, null],
  ])("has no WCAG A or AA violations %s", async (_name, movie, reason) => {
    const { container } = render(
      <MovieDetailView movie={movie} reason={reason} />,
    );

    expect(await axeViolations(container)).toEqual([]);
  });

  it("hides the title frame from screen readers, so the title is read once", () => {
    const { container } = render(
      <MovieDetailView movie={{ ...heat, posterPath: null }} reason={null} />,
    );

    expect(
      slot(container, "poster-fallback")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });
});

describe("MovieDetailView feedback controls (spec 0011, AC-11)", () => {
  it("shows both controls right under the poster and its reason, before the title", () => {
    const { container } = render(
      <MovieDetailView
        movie={heat}
        movieId={42}
        reason={REASON}
        feedback={{ kind: null }}
      />,
    );

    const bar = container.querySelector('[data-slot="subtitle-bar"]');
    const controls = container.querySelector('[data-slot="feedback-controls"]');
    const title = screen.getByRole("heading", { level: 1, name: "Heat" });
    if (!bar || !controls) throw new Error("expected the bar and the controls");
    const follows = (first: Node, second: Node) =>
      (first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
      0;
    expect(follows(bar, controls)).toBe(true);
    expect(follows(controls, title)).toBe(true);
    expect(
      screen.getByRole("button", { name: "More like this: Heat" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Not interested in Heat" }),
    ).toBeTruthy();
  });

  it("opens in the hidden state with Undo for a dismissed movie", () => {
    render(
      <MovieDetailView
        movie={heat}
        movieId={42}
        reason={null}
        feedback={{ kind: "not_interested" }}
      />,
    );

    expect(screen.getByText("Hidden from your picks.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Undo hiding Heat" }),
    ).toBeTruthy();
  });

  it("shows no controls without feedback, or without a movie id", () => {
    const none = render(
      <MovieDetailView movie={heat} movieId={42} reason={REASON} />,
    );
    expect(
      none.container.querySelector('[data-slot="feedback-controls"]'),
    ).toBeNull();
    cleanup();

    const noId = render(
      <MovieDetailView
        movie={heat}
        reason={REASON}
        feedback={{ kind: null }}
      />,
    );
    expect(
      noId.container.querySelector('[data-slot="feedback-controls"]'),
    ).toBeNull();
  });

  it("has no accessibility violations with the controls, shown or hidden", async () => {
    const shown = render(
      <MovieDetailView
        movie={heat}
        movieId={42}
        reason={REASON}
        feedback={{ kind: "more_like_this" }}
      />,
    );
    expect(await axeViolations(shown.container)).toEqual([]);
    cleanup();
    const hidden = render(
      <MovieDetailView
        movie={heat}
        movieId={42}
        reason={null}
        feedback={{ kind: "not_interested" }}
      />,
    );
    expect(await axeViolations(hidden.container)).toEqual([]);
  });
});

describe("MovieDetailView afterOverview slot (spec 0013, AC-1)", () => {
  it("shows the slot after the synopsis and before the director line", () => {
    const { container } = render(
      <MovieDetailView
        movie={heat}
        reason={null}
        afterOverview={<section data-slot="slot">Where to watch</section>}
      />,
    );

    const order = [
      ...container.querySelectorAll(
        '[data-slot="movie-overview"], [data-slot="slot"], [data-slot="movie-directors"]',
      ),
    ].map((el) => el.getAttribute("data-slot"));
    expect(order).toEqual(["movie-overview", "slot", "movie-directors"]);
  });

  it("shows nothing extra when no slot is passed", () => {
    const { container } = render(
      <MovieDetailView movie={heat} reason={null} />,
    );

    expect(container.querySelector('[data-slot="slot"]')).toBeNull();
  });
});

// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hero } from "./hero";
import type { HeroPick } from "./hero-picks";
import { SAMPLE_REASON } from "./hero-picks";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "./paths";

beforeEach(() => {
  // A real browser reports an image that is still loading as not complete.
  Object.defineProperty(HTMLImageElement.prototype, "complete", {
    configurable: true,
    get: () => false,
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLImageElement.prototype, "complete");
});

const pick: HeroPick = {
  movie: {
    id: 7,
    title: "Collateral",
    releaseYear: 2004,
    posterPath: "/c.jpg",
  },
  reason: "Because you rated Heat highly.",
};

describe("Hero with a pick (AC-15)", () => {
  it("shows the wordmark, one headline and one line", () => {
    render(<Hero pick={pick} />);

    expect(screen.getByText("Moviz")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "Picks that say why." }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Swipe a few movies you know. Every pick Moviz makes comes with its reason.",
      ),
    ).toBeTruthy();
  });

  it("links the two buttons to sign up and sign in", () => {
    render(<Hero pick={pick} />);

    expect(
      screen.getByRole("link", { name: "Start swiping" }).getAttribute("href"),
    ).toBe(SIGN_UP_PATH);
    expect(
      screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
    ).toBe(SIGN_IN_PATH);
  });

  it("shows the poster at w500 with high fetch priority, and its title and year", () => {
    render(<Hero pick={pick} />);
    const poster = screen.getByRole("img", { name: "Poster for Collateral" });

    expect(poster.getAttribute("src")).toContain("/w500/c.jpg");
    expect(poster.getAttribute("fetchpriority")).toBe("high");
    expect(screen.getByText("Collateral")).toBeTruthy();
    expect(screen.getByText("2004")).toBeTruthy();
  });

  it("sets the reason on the poster, after hidden text that says it is an example", () => {
    const { container } = render(<Hero pick={pick} />);
    const bar = container.querySelector('[data-slot="subtitle-bar"]');

    expect(bar?.textContent).toBe(
      "Example pick: Because you rated Heat highly.",
    );
    expect(bar?.querySelector(".sr-only")?.textContent).toBe("Example pick: ");
  });

  it("has no stats, badges or card grid", () => {
    const { container } = render(<Hero pick={pick} />);

    expect(container.querySelectorAll("article")).toHaveLength(0);
    expect(container.querySelectorAll("ul")).toHaveLength(0);
  });

  it("puts the text column before the poster in the page", () => {
    const { container } = render(<Hero pick={pick} />);
    const html = container.innerHTML;

    expect(html.indexOf("Moviz")).toBeLessThan(
      html.indexOf("Picks that say why."),
    );
    expect(html.indexOf("Picks that say why.")).toBeLessThan(
      html.indexOf("Start swiping"),
    );
    expect(html.indexOf("Start swiping")).toBeLessThan(html.indexOf("<figure"));
  });
});

describe("Hero with no pick (AC-15)", () => {
  it("still renders everything, with an empty poster frame and the sample reason", () => {
    const { container } = render(<Hero pick={null} />);

    expect(screen.getByText("Moviz")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start swiping" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("figcaption")).toBeNull();
    expect(
      container.querySelector('[data-slot="subtitle-bar"]')?.textContent,
    ).toBe(`Example pick: ${SAMPLE_REASON}`);
  });
});

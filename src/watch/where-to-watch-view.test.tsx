// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test-support/axe";

// The picker has its own tests; its router and action are boundaries here.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/movie/42",
}));
vi.mock("./actions", () => ({ setCountryAction: vi.fn() }));

import type { OfferGroup } from "./offers";
import type { CountryOption } from "./regions";
import {
  WhereToWatchSkeleton,
  type WhereToWatchState,
  WhereToWatchView,
} from "./where-to-watch-view";

// Spec 0013: what each state of the section shows (AC-1 to AC-6, AC-8, AC-12).

const OPTIONS: CountryOption[] = [
  { code: "FR", name: "France" },
  { code: "US", name: "United States" },
];

const GROUPS: OfferGroup[] = [
  {
    key: "stream",
    label: "Stream",
    offers: [
      {
        type: "flatrate",
        providerId: 8,
        name: "Netflix",
        logoPath: "/n.jpg",
        priority: 0,
      },
      {
        type: "flatrate",
        providerId: 9,
        name: "No Logo Plus",
        logoPath: null,
        priority: 1,
      },
    ],
  },
  {
    key: "rent",
    label: "Rent",
    offers: [
      {
        type: "rent",
        providerId: 2,
        name: "Apple TV",
        logoPath: "/a.jpg",
        priority: 0,
      },
    ],
  },
];

const OFFERS: WhereToWatchState = {
  kind: "offers",
  country: "US",
  groups: GROUPS,
  link: "https://www.themoviedb.org/movie/949/watch?locale=US",
};

const view = (state: WhereToWatchState, headingLevel?: 2 | 4) =>
  render(
    <WhereToWatchView
      state={state}
      options={OPTIONS}
      headingLevel={headingLevel}
    />,
  );

const credit = () => screen.queryByText(/Streaming data from/);

afterEach(cleanup);

describe("WhereToWatchView offers (AC-2, AC-3, AC-4)", () => {
  it("shows the heading, the country line and Change country", () => {
    view(OFFERS);

    expect(
      screen.getByRole("heading", { level: 2, name: "Where to watch" }),
    ).toBeTruthy();
    expect(document.getElementById("where-to-watch-country")?.textContent).toBe(
      "In United States",
    );
    expect(screen.getByRole("button", { name: "Change country" })).toBeTruthy();
  });

  it("makes each group a list labelled by its own h3", () => {
    view(OFFERS);

    const stream = screen.getByRole("list", { name: "Stream" });
    const rent = screen.getByRole("list", { name: "Rent" });
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Stream", "Rent"]);
    expect(
      within(stream)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Netflix", "No Logo Plus"]);
    expect(within(rent).getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows each logo with an empty alt from TMDB w92, and a plain square when there is none", () => {
    const { container } = view(OFFERS);

    const images = container.querySelectorAll("li img");
    expect(images).toHaveLength(2);
    for (const img of images) {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("src")).toMatch(
        /^https:\/\/image\.tmdb\.org\/t\/p\/w92\//,
      );
    }
    expect(
      container.querySelectorAll("li span[aria-hidden='true']"),
    ).toHaveLength(1);
  });

  it("does not make a service a link", () => {
    const { container } = view(OFFERS);

    expect(container.querySelectorAll("li a")).toHaveLength(0);
  });

  it("ends with the TMDB link in the same tab and the JustWatch credit", () => {
    view(OFFERS);

    const link = screen.getByRole("link", { name: "See all options on TMDB" });
    expect(link.getAttribute("href")).toBe(
      OFFERS.kind === "offers" ? OFFERS.link : "",
    );
    expect(link.hasAttribute("target")).toBe(false);
    expect(credit()?.textContent).toBe("Streaming data from JustWatch");
    expect(
      screen.getByRole("link", { name: "JustWatch" }).getAttribute("href"),
    ).toBe("https://www.justwatch.com");
  });

  it("leaves out the TMDB line when TMDB sent no link, and keeps the credit", () => {
    view({ ...OFFERS, link: null } as WhereToWatchState);

    expect(
      screen.queryByRole("link", { name: "See all options on TMDB" }),
    ).toBeNull();
    expect(credit()).toBeTruthy();
  });

  it("is clean under axe", async () => {
    const { container } = view(OFFERS);

    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("WhereToWatchView other states", () => {
  it("shows Not found on streaming with the country name and the credit (AC-3, AC-4)", () => {
    view({ kind: "empty", country: "FR" });

    expect(screen.getByText("Not found on streaming in France.")).toBeTruthy();
    expect(credit()).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "See all options on TMDB" }),
    ).toBeNull();
    expect(screen.queryAllByRole("list")).toHaveLength(0);
  });

  it("asks for a country with the picker open and no offers (AC-5)", () => {
    view({ kind: "no_country" });

    expect(document.getElementById("where-to-watch-country")?.textContent).toBe(
      "Choose your country to see where to watch.",
    );
    expect(screen.getByLabelText("Country")).toBeTruthy();
    expect(screen.queryAllByRole("list")).toHaveLength(0);
    expect(credit()).toBeNull();
  });

  it("says it could not load, with no offers and no credit (AC-8)", () => {
    view({ kind: "unavailable", country: "US" });

    expect(
      screen.getByText("Could not load streaming services right now."),
    ).toBeTruthy();
    expect(screen.queryAllByRole("list")).toHaveLength(0);
    expect(credit()).toBeNull();
    expect(document.getElementById("where-to-watch-country")?.textContent).toBe(
      "In United States",
    );
  });

  it.each([
    ["empty", { kind: "empty", country: "FR" }],
    ["no country", { kind: "no_country" }],
    ["unavailable", { kind: "unavailable", country: "US" }],
  ] as const)("is clean under axe when %s (AC-12)", async (_label, state) => {
    const { container } = view(state);

    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("WhereToWatchView heading levels and ids (AC-1)", () => {
  it("uses h4 and h5 on the /design page", () => {
    view(OFFERS, 4);

    expect(
      screen.getByRole("heading", { level: 4, name: "Where to watch" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 5 })).toHaveLength(2);
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });

  it("keeps ids unique when two sections share a page", () => {
    const { container } = render(
      <>
        <WhereToWatchView state={OFFERS} options={OPTIONS} idPrefix="a" />
        <WhereToWatchView state={OFFERS} options={OPTIONS} idPrefix="b" />
      </>,
    );

    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("WhereToWatchSkeleton (AC-1)", () => {
  it("keeps the real heading and hides its blocks from screen readers", () => {
    const { container } = render(<WhereToWatchSkeleton />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Where to watch" }),
    ).toBeTruthy();
    expect(container.querySelector("[aria-hidden='true']")).toBeTruthy();
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
  });
});

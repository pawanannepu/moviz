// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";

// `loadAvailability` has its own database tests. These tests cover how the
// section turns its result into a state, and that it never throws (spec 0013,
// AC-2, AC-3, AC-5, AC-8).
const loadAvailability = vi.fn();
const createTmdbClient = vi.fn(() => ({ name: "tmdb" }));
const env = vi.hoisted(() => ({
  TMDB_API_TOKEN: "token" as string | undefined,
}));
const { fakeDb } = vi.hoisted(() => ({ fakeDb: { name: "fake-db" } }));

vi.mock("@/env", () => ({ env }));
vi.mock("@/db/client", () => ({ db: fakeDb }));
vi.mock("@/catalog/tmdb/client", () => ({
  createTmdbClient: (...args: unknown[]) => createTmdbClient(...(args as [])),
}));
vi.mock("./load-availability", () => ({
  loadAvailability: (...args: unknown[]) => loadAvailability(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/movie/42",
}));
vi.mock("./actions", () => ({ setCountryAction: vi.fn() }));

import { WhereToWatch } from "./where-to-watch";

const REGION = {
  link: "https://www.themoviedb.org/movie/1/watch?locale=US",
  offers: [
    {
      type: "ads",
      providerId: 1,
      name: "Pluto TV",
      logoPath: null,
      priority: 1,
    },
  ],
};

async function show(country: string | null) {
  render(await WhereToWatch({ movieId: 42, country }));
  return document.querySelector('[data-slot="where-to-watch"]');
}

beforeEach(() => {
  vi.resetAllMocks();
  env.TMDB_API_TOKEN = "token";
  createTmdbClient.mockReturnValue({ name: "tmdb" });
});

afterEach(cleanup);

describe("WhereToWatch", () => {
  it("asks for a country, with no read, when there is none (AC-5)", async () => {
    const section = await show(null);

    expect(section?.getAttribute("data-state")).toBe("no_country");
    expect(loadAvailability).not.toHaveBeenCalled();
  });

  it("reads the asked country with the TMDB client and the clock (AC-7)", async () => {
    loadAvailability.mockResolvedValue(
      ok({ region: REGION, fetchedAt: new Date() }),
    );

    await show("US");

    expect(createTmdbClient).toHaveBeenCalledWith({ token: "token" });
    expect(loadAvailability).toHaveBeenCalledWith(
      { db: fakeDb, tmdb: { name: "tmdb" } },
      { movieId: 42, country: "US", now: expect.any(Date) },
    );
  });

  it("reads with no TMDB client when the token is unset (AC-8)", async () => {
    env.TMDB_API_TOKEN = undefined;
    loadAvailability.mockResolvedValue(
      ok({ region: null, fetchedAt: new Date() }),
    );

    await show("US");

    expect(createTmdbClient).not.toHaveBeenCalled();
    expect(loadAvailability.mock.calls[0][0]).toEqual({
      db: fakeDb,
      tmdb: undefined,
    });
  });

  it("shows the grouped offers and the TMDB link (AC-2, AC-3)", async () => {
    loadAvailability.mockResolvedValue(
      ok({ region: REGION, fetchedAt: new Date() }),
    );

    const section = await show("US");

    expect(section?.getAttribute("data-state")).toBe("offers");
    expect(screen.getByRole("list", { name: "Free" }).textContent).toBe(
      "Pluto TV",
    );
    expect(
      screen
        .getByRole("link", { name: "See all options on TMDB" })
        .getAttribute("href"),
    ).toBe(REGION.link);
  });

  it.each([
    ["no region", null],
    ["a region with no offers", { link: "x", offers: [] }],
  ])("shows the empty state for %s (AC-3)", async (_label, region) => {
    loadAvailability.mockResolvedValue(ok({ region, fetchedAt: new Date() }));

    const section = await show("FR");

    expect(section?.getAttribute("data-state")).toBe("empty");
    expect(screen.getByText("Not found on streaming in France.")).toBeTruthy();
  });

  it("shows the unavailable state when the read fails (AC-8)", async () => {
    loadAvailability.mockResolvedValue(err({ code: "unavailable" }));

    const section = await show("US");

    expect(section?.getAttribute("data-state")).toBe("unavailable");
  });

  it("shows the unavailable state instead of throwing (AC-8)", async () => {
    loadAvailability.mockRejectedValue(new Error("boom"));

    const section = await show("US");

    expect(section?.getAttribute("data-state")).toBe("unavailable");
  });
});

// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogMovie } from "@/catalog/read/get-movie";
import { err, ok } from "@/lib/result";

// Spec 0010: the guards and their fixed order (AC-1, AC-2), the shell that
// does not wait for the movie (AC-10), and the page title (AC-19). The
// session and the movie read are boundaries, so they are replaced.
const requireUser = vi.fn();
const getSession = vi.fn();
const getProfile = vi.fn();
const readMovie = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
const notFound = vi.fn(() => {
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
});
const { fakeDb, body } = vi.hoisted(() => ({
  fakeDb: { name: "fake-db" },
  body: { mode: "ready" as "ready" | "slow" },
}));

vi.mock("@/auth/session", () => ({
  requireUser: (...args: unknown[]) => requireUser(...args),
  getSession: (...args: unknown[]) => getSession(...args),
}));
vi.mock("@/db/client", () => ({ db: fakeDb }));
vi.mock("@/profile/profile", () => ({
  getProfile: (...args: unknown[]) => getProfile(...args),
}));
vi.mock("@/movie/read-movie", () => ({
  readMovie: (...args: unknown[]) => readMovie(...args),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
  notFound: () => notFound(),
  unstable_rethrow: () => undefined,
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/movie/412",
}));
vi.mock("@/auth/forms/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));
// The page body has its own tests. Here it either shows at once, or stays
// pending so the loading state is what the page can show.
vi.mock("@/movie/movie-detail", () => ({
  MovieDetail: (props: { userId: string; movieId: number }) => {
    if (body.mode === "slow") use(new Promise<never>(() => {}));
    return (
      <p data-testid="movie-body">
        movie {props.movieId} for {props.userId}
      </p>
    );
  },
}));

import MoviePage, { generateMetadata } from "./page";

type PageInput = Parameters<typeof MoviePage>[0];
const at = (id: string) =>
  ({ params: Promise.resolve({ id }) }) as unknown as PageInput;

const USER = { id: "user-1" };
const heat = (overrides: Partial<CatalogMovie> = {}) =>
  ({
    id: 412,
    title: "Heat",
    releaseYear: 1995,
    removed: false,
    ...overrides,
  }) as CatalogMovie;

beforeEach(() => {
  vi.clearAllMocks();
  body.mode = "ready";
  requireUser.mockResolvedValue({ user: USER });
  getSession.mockResolvedValue({ user: USER });
  readMovie.mockResolvedValue(ok(heat()));
});
afterEach(cleanup);

describe("MoviePage guards (AC-1)", () => {
  it("asks for the live session with the movie's own address as the return path", async () => {
    await MoviePage(at("412"));

    expect(requireUser).toHaveBeenCalledWith("/movie/412");
  });

  it("goes no further when the visitor is signed out", async () => {
    requireUser.mockRejectedValue(
      new Error("NEXT_REDIRECT /sign-in?returnTo=%2Fmovie%2F412"),
    );

    await expect(MoviePage(at("412"))).rejects.toThrow(
      "NEXT_REDIRECT /sign-in",
    );

    expect(notFound).not.toHaveBeenCalled();
    expect(readMovie).not.toHaveBeenCalled();
  });

  it("has no onboarding check: it never reads the profile", async () => {
    await MoviePage(at("412"));

    expect(getProfile).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("makes no movie read itself: that happens only when the page body renders", async () => {
    await MoviePage(at("412"));

    expect(readMovie).not.toHaveBeenCalled();
  });
});

describe("MoviePage id check (AC-2)", () => {
  it.each(["0", "012", "12a", "abc", "1.5", "-3", "", "1234567890123456"])(
    "answers the id %j with the not found page",
    async (id) => {
      await expect(MoviePage(at(id))).rejects.toThrow("404");

      expect(notFound).toHaveBeenCalledTimes(1);
    },
  );

  it("checks the session before it answers a bad id, with /home as the return path", async () => {
    await expect(MoviePage(at("abc"))).rejects.toThrow("404");

    expect(requireUser).toHaveBeenCalledWith("/home");
    expect(requireUser.mock.invocationCallOrder[0]).toBeLessThan(
      notFound.mock.invocationCallOrder[0],
    );
  });

  it("sends a visitor with a stale session and a bad id to sign in, not to a 404", async () => {
    requireUser.mockRejectedValue(
      new Error("NEXT_REDIRECT /sign-in?returnTo=%2Fhome"),
    );

    await expect(MoviePage(at("abc"))).rejects.toThrow(
      "NEXT_REDIRECT /sign-in?returnTo=%2Fhome",
    );

    expect(notFound).not.toHaveBeenCalled();
  });

  it("runs no movie read for a bad id", async () => {
    await expect(MoviePage(at("012"))).rejects.toThrow("404");

    expect(readMovie).not.toHaveBeenCalled();
  });

  it("does not call the not found page for a good id", async () => {
    await MoviePage(at("999999999999999"));

    expect(notFound).not.toHaveBeenCalled();
    expect(requireUser).toHaveBeenCalledWith("/movie/999999999999999");
  });
});

describe("MoviePage shell (AC-4, AC-10)", () => {
  it("shows the header, the back link and the movie", async () => {
    render(await MoviePage(at("412")));

    expect(screen.getByRole("link", { name: "Moviz" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to picks" }).getAttribute("href"),
    ).toBe("/home");
    expect(screen.getByTestId("movie-body")).toBeTruthy();
  });

  it("hands the body the user from the session and the id from the address", async () => {
    render(await MoviePage(at("412")));

    expect(screen.getByTestId("movie-body").textContent).toBe(
      "movie 412 for user-1",
    );
  });

  it("puts the back link above the movie", async () => {
    render(await MoviePage(at("412")));

    const back = screen.getByRole("link", { name: "Back to picks" });
    expect(
      back.compareDocumentPosition(screen.getByTestId("movie-body")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the header, the back link and the loading state while the movie is not ready", async () => {
    body.mode = "slow";
    const page = await MoviePage(at("412"));

    await act(async () => {
      render(page);
    });

    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to picks" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Loading movie");
    expect(
      document.querySelector('[data-slot="movie-detail-skeleton"]'),
    ).not.toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByTestId("movie-body")).toBeNull();
  });
});

describe("MoviePage title (AC-19)", () => {
  const titleOf = async (id: string) => (await generateMetadata(at(id))).title;

  it("names the movie and its year", async () => {
    expect(await titleOf("412")).toBe("Heat (1995) · Moviz");
  });

  it("leaves the year and its parentheses out when the year is null", async () => {
    readMovie.mockResolvedValue(ok(heat({ releaseYear: null })));

    expect(await titleOf("412")).toBe("Heat · Moviz");
  });

  it("reads the movie once, through the read the page body shares", async () => {
    await titleOf("412");

    expect(readMovie).toHaveBeenCalledTimes(1);
    expect(readMovie).toHaveBeenCalledWith(fakeDb, 412);
  });

  it.each(["0", "012", "12a", "abc", "1.5", "-3"])(
    "says Movie not found for the bad id %j, with no movie read",
    async (id) => {
      expect(await titleOf(id)).toBe("Movie not found · Moviz");
      expect(readMovie).not.toHaveBeenCalled();
    },
  );

  it("says Movie not found for an unknown movie", async () => {
    readMovie.mockResolvedValue(err({ code: "movie_not_found" }));

    expect(await titleOf("412")).toBe("Movie not found · Moviz");
  });

  it("says Movie not found for a removed movie, and does not name it", async () => {
    readMovie.mockResolvedValue(ok(heat({ removed: true })));

    expect(await titleOf("412")).toBe("Movie not found · Moviz");
  });

  it("is plain Moviz when the movie read fails", async () => {
    readMovie.mockResolvedValue(err({ code: "db_unavailable" }));

    expect(await titleOf("412")).toBe("Moviz");
  });

  it("is plain Moviz with no session, and reads no movie title for that visitor", async () => {
    getSession.mockResolvedValue(null);

    expect(await titleOf("412")).toBe("Moviz");
    expect(await titleOf("abc")).toBe("Moviz");
    expect(readMovie).not.toHaveBeenCalled();
  });

  it("checks the session before anything else", async () => {
    await titleOf("412");

    expect(getSession.mock.invocationCallOrder[0]).toBeLessThan(
      readMovie.mock.invocationCallOrder[0],
    );
  });

  it("never throws: a failed session read gives the plain title", async () => {
    getSession.mockRejectedValue(new Error("session store down"));

    expect(await titleOf("412")).toBe("Moviz");
  });

  it("never throws: a thrown movie read gives the plain title", async () => {
    readMovie.mockRejectedValue(new Error("boom"));

    expect(await titleOf("412")).toBe("Moviz");
  });

  it("never redirects and never calls the not found page", async () => {
    getSession.mockResolvedValue(null);
    await titleOf("412");
    getSession.mockResolvedValue({ user: USER });
    await titleOf("abc");

    expect(redirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
    expect(requireUser).not.toHaveBeenCalled();
  });

  it.each([
    ["a found movie", "412", true],
    ["a bad id", "abc", true],
    ["no session", "412", false],
  ])(
    "keeps the page out of search engines for %s",
    async (_name, id, signedIn) => {
      getSession.mockResolvedValue(signedIn ? { user: USER } : null);

      expect((await generateMetadata(at(id))).robots).toEqual({
        index: false,
        follow: false,
      });
    },
  );
});

import { describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/movie-949.json";
import { createTmdbClient, REQUEST_TIMEOUT_MS } from "./client";
import { discoverMovies, getGenreNames, MAX_DISCOVER_PAGE } from "./discover";

const TOKEN = "tmdb-secret-token-123";

function client(fetchMock: typeof fetch) {
  return createTmdbClient({
    token: TOKEN,
    fetch: fetchMock,
    sleep: async () => undefined,
    random: () => 0,
  });
}

const answer = (body: unknown, status = 200) => Response.json(body, { status });

describe("createTmdbClient (AC-15, AC-16)", () => {
  it("asks for English details with credits and alternative titles", async () => {
    const fetchMock = vi.fn(async () => answer(fixture));

    const result = await client(
      fetchMock as unknown as typeof fetch,
    ).getMovieDetails(949);

    expect(result.ok).toBe(true);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.pathname).toBe("/3/movie/949");
    expect(url.searchParams.get("language")).toBe("en-US");
    expect(url.searchParams.get("append_to_response")).toBe(
      "credits,alternative_titles",
    );
  });

  it("sends the token only in the Authorization header", async () => {
    const fetchMock = vi.fn(async () => answer(fixture));

    await client(fetchMock as unknown as typeof fetch).getMovieDetails(949);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(String(url)).not.toContain(TOKEN);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it("parses the response and rejects a wrong shape as tmdb_bad_shape", async () => {
    const fetchMock = vi.fn(async () => answer({ id: "not a number" }));

    const result = await client(
      fetchMock as unknown as typeof fetch,
    ).getMovieDetails(1);

    expect(result).toEqual({ ok: false, error: { code: "tmdb_bad_shape" } });
  });

  it("maps 401 to tmdb_unauthorized and 404 to tmdb_not_found", async () => {
    const unauthorized = await client((async () =>
      answer({}, 401)) as unknown as typeof fetch).getMovieDetails(1);
    const missing = await client((async () =>
      answer({}, 404)) as unknown as typeof fetch).getMovieDetails(1);

    expect(unauthorized).toEqual({
      ok: false,
      error: { code: "tmdb_unauthorized" },
    });
    expect(missing).toEqual({ ok: false, error: { code: "tmdb_not_found" } });
  });

  it("maps a persistent 500 to tmdb_unavailable after 3 tries", async () => {
    const fetchMock = vi.fn(async () => answer({}, 500));

    const result = await client(
      fetchMock as unknown as typeof fetch,
    ).getMovieDetails(1);

    expect(result).toEqual({
      ok: false,
      error: { code: "tmdb_unavailable", status: 500 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never puts the token in an error", async () => {
    const result = await client((async () =>
      answer({ echo: TOKEN }, 500)) as unknown as typeof fetch).getMovieDetails(
      1,
    );

    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("uses a 10 second timeout per call", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(10_000);
  });
});

describe("discoverMovies", () => {
  const page = { page: 1, total_pages: 9, results: [{ id: 3 }, { id: 4 }] };

  it("returns the ids in TMDB's order with the page count", async () => {
    const fetchMock = vi.fn(async () => answer(page));

    const result = await discoverMovies(
      client(fetchMock as unknown as typeof fetch),
      { sortBy: "vote_count.desc", page: 1, minVotes: 500 },
    );

    expect(result).toEqual({ ok: true, value: { ids: [3, 4], totalPages: 9 } });
  });

  it("always excludes adult and video entries and asks for English", async () => {
    const fetchMock = vi.fn(async () => answer(page));

    await discoverMovies(client(fetchMock as unknown as typeof fetch), {
      sortBy: "vote_count.desc",
      page: 2,
      minVotes: 500,
      releasedOnOrBefore: "2026-11-08",
      releasedOnOrAfter: "2025-11-08",
    });

    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.pathname).toBe("/3/discover/movie");
    expect(url.searchParams.get("include_adult")).toBe("false");
    expect(url.searchParams.get("include_video")).toBe("false");
    expect(url.searchParams.get("language")).toBe("en-US");
    expect(url.searchParams.get("sort_by")).toBe("vote_count.desc");
    expect(url.searchParams.get("vote_count.gte")).toBe("500");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("primary_release_date.lte")).toBe("2026-11-08");
    expect(url.searchParams.get("primary_release_date.gte")).toBe("2025-11-08");
  });

  it("leaves the date filters out when none is given", async () => {
    const fetchMock = vi.fn(async () => answer(page));

    await discoverMovies(client(fetchMock as unknown as typeof fetch), {
      sortBy: "popularity.desc",
      page: 1,
      minVotes: 500,
    });

    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.has("primary_release_date.lte")).toBe(false);
    expect(url.searchParams.has("primary_release_date.gte")).toBe(false);
  });

  it("returns no ids without a request past page 500 or before page 1", async () => {
    const fetchMock = vi.fn(async () => answer(page));
    const tmdb = client(fetchMock as unknown as typeof fetch);

    const past = await discoverMovies(tmdb, {
      sortBy: "vote_count.desc",
      page: MAX_DISCOVER_PAGE + 1,
      minVotes: 500,
    });
    const before = await discoverMovies(tmdb, {
      sortBy: "vote_count.desc",
      page: 0,
      minVotes: 500,
    });

    expect(past).toEqual({ ok: true, value: { ids: [], totalPages: 0 } });
    expect(before).toEqual({ ok: true, value: { ids: [], totalPages: 0 } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a typed error for a discover page of the wrong shape", async () => {
    const result = await discoverMovies(
      client((async () =>
        answer({ results: "no" })) as unknown as typeof fetch),
      { sortBy: "vote_count.desc", page: 1, minVotes: 500 },
    );

    expect(result).toEqual({ ok: false, error: { code: "tmdb_bad_shape" } });
  });
});

describe("getGenreNames", () => {
  it("returns the English genre names", async () => {
    const result = await getGenreNames(
      client((async () =>
        answer({
          genres: [
            { id: 1, name: "Drama" },
            { id: 2, name: "Action" },
          ],
        })) as unknown as typeof fetch),
    );

    expect(result).toEqual({ ok: true, value: ["Drama", "Action"] });
  });
});

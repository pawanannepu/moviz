import { describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./model";
import { createVoyageClient, VOYAGE_TIMEOUT_MS } from "./voyage-client";

const KEY = "voyage-secret-key-123";
const vector = (size = EMBEDDING_DIMENSIONS) =>
  new Array<number>(size).fill(0.5);

function client(fetchMock: typeof fetch) {
  return createVoyageClient({
    apiKey: KEY,
    fetch: fetchMock,
    sleep: async () => undefined,
    random: () => 0,
  });
}

const answer = (body: unknown, status = 200) => Response.json(body, { status });

describe("createVoyageClient (AC-8, AC-15, AC-16)", () => {
  it("posts the texts as document input at 1024 dimensions with the catalog model", async () => {
    const fetchMock = vi.fn(async () =>
      answer({ data: [{ index: 0, embedding: vector() }] }),
    );

    await client(fetchMock as unknown as typeof fetch).embedDocuments(["a"]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.hostname).toBe("api.voyageai.com");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      input: ["a"],
      model: EMBEDDING_MODEL,
      input_type: "document",
      output_dimension: EMBEDDING_DIMENSIONS,
    });
  });

  it("sends the key only in the Authorization header", async () => {
    const fetchMock = vi.fn(async () =>
      answer({ data: [{ index: 0, embedding: vector() }] }),
    );

    await client(fetchMock as unknown as typeof fetch).embedDocuments(["a"]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(String(url)).not.toContain(KEY);
    expect(String(init.body)).not.toContain(KEY);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${KEY}`,
    );
  });

  it("returns one vector per text in input order, matched by index", async () => {
    const first = vector();
    const second = vector().map((n) => n + 1);
    const result = await client((async () =>
      answer({
        // Out of order on purpose.
        data: [
          { index: 1, embedding: second },
          { index: 0, embedding: first },
        ],
      })) as unknown as typeof fetch).embedDocuments(["a", "b"]);

    expect(result).toEqual({ ok: true, value: [first, second] });
  });

  it("returns null for a vector of the wrong size so one movie can fail alone", async () => {
    const result = await client((async () =>
      answer({
        data: [
          { index: 0, embedding: vector(3) },
          { index: 1, embedding: vector() },
        ],
      })) as unknown as typeof fetch).embedDocuments(["a", "b"]);

    expect(result.ok && result.value[0]).toBeNull();
    expect(result.ok && result.value[1]).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("returns voyage_bad_shape when a vector is missing, repeated or out of range", async () => {
    const missing = await client((async () =>
      answer({
        data: [{ index: 0, embedding: vector() }],
      })) as unknown as typeof fetch).embedDocuments(["a", "b"]);
    const repeated = await client((async () =>
      answer({
        data: [
          { index: 0, embedding: vector() },
          { index: 0, embedding: vector() },
        ],
      })) as unknown as typeof fetch).embedDocuments(["a", "b"]);
    const outOfRange = await client((async () =>
      answer({
        data: [{ index: 5, embedding: vector() }],
      })) as unknown as typeof fetch).embedDocuments(["a"]);

    for (const result of [missing, repeated, outOfRange]) {
      expect(result).toEqual({
        ok: false,
        error: { code: "voyage_bad_shape" },
      });
    }
  });

  it("returns voyage_bad_shape for a response of the wrong shape", async () => {
    const result = await client((async () =>
      answer({ nothing: true })) as unknown as typeof fetch).embedDocuments([
      "a",
    ]);

    expect(result).toEqual({ ok: false, error: { code: "voyage_bad_shape" } });
  });

  it("maps 401 to voyage_unauthorized and a persistent 503 to voyage_unavailable", async () => {
    const unauthorized = await client((async () =>
      answer({}, 401)) as unknown as typeof fetch).embedDocuments(["a"]);
    const fetchMock = vi.fn(async () => answer({}, 503));
    const unavailable = await client(
      fetchMock as unknown as typeof fetch,
    ).embedDocuments(["a"]);

    expect(unauthorized).toEqual({
      ok: false,
      error: { code: "voyage_unauthorized" },
    });
    expect(unavailable).toEqual({
      ok: false,
      error: { code: "voyage_unavailable", status: 503 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never puts the key in an error", async () => {
    const result = await client((async () =>
      answer({ echo: KEY }, 500)) as unknown as typeof fetch).embedDocuments([
      "a",
    ]);

    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("uses a 20 second timeout per call", () => {
    expect(VOYAGE_TIMEOUT_MS).toBe(20_000);
  });
});

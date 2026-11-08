import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  BACKOFF_BASE_MS,
  BACKOFF_JITTER_MS,
  MAX_ATTEMPTS,
  RETRY_AFTER_CAP_MS,
  requestJson,
} from "./request-json";

const schema = z.object({ value: z.number() });
const url = new URL("https://provider.example.test/thing");

/** A fetch that answers from a list, one answer per call. */
function scripted(answers: Array<Response | Error>) {
  const fetchMock = vi.fn(async () => {
    const next = answers.shift();
    if (next === undefined) throw new Error("no more scripted answers");
    if (next instanceof Error) throw next;
    return next;
  });
  return fetchMock as unknown as typeof fetch & typeof fetchMock;
}

function setup(answers: Array<Response | Error>, deadline?: number) {
  const fetchMock = scripted(answers);
  const sleeps: number[] = [];
  const run = () =>
    requestJson(
      {
        url,
        headers: { Authorization: "Bearer secret-token" },
        schema,
        timeoutMs: 1000,
        deadline,
      },
      {
        fetch: fetchMock,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        random: () => 0,
        now: () => 0,
      },
    );
  return { fetchMock, sleeps, run };
}

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });

describe("requestJson (AC-15, AC-16)", () => {
  it("returns the parsed body on a 200", async () => {
    const { run, fetchMock } = setup([json({ value: 7 })]);

    const result = await run();

    expect(result).toEqual({ ok: true, value: { value: 7 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns bad_shape for JSON of the wrong shape and does not retry", async () => {
    const { run, fetchMock } = setup([json({ value: "seven" })]);

    expect(await run()).toEqual({ ok: false, error: { code: "bad_shape" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns bad_shape when the body is not JSON", async () => {
    const { run } = setup([new Response("<html>nope</html>")]);

    expect(await run()).toEqual({ ok: false, error: { code: "bad_shape" } });
  });

  it("maps 401 and 403 to unauthorized without retrying", async () => {
    for (const status of [401, 403]) {
      const { run, fetchMock } = setup([new Response("{}", { status })]);

      expect(await run()).toEqual({
        ok: false,
        error: { code: "unauthorized" },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("maps 404 to not_found without retrying", async () => {
    const { run, fetchMock } = setup([new Response("{}", { status: 404 })]);

    expect(await run()).toEqual({ ok: false, error: { code: "not_found" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps another 4xx to rejected without retrying", async () => {
    const { run, fetchMock } = setup([new Response("{}", { status: 422 })]);

    expect(await run()).toEqual({
      ok: false,
      error: { code: "rejected", status: 422 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 and succeeds on the next try", async () => {
    const { run, fetchMock, sleeps } = setup([
      new Response("{}", { status: 500 }),
      json({ value: 1 }),
    ]);

    expect(await run()).toEqual({ ok: true, value: { value: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([BACKOFF_BASE_MS]);
  });

  it("tries 3 times in total, backing off 500 ms then 1000 ms", async () => {
    const { run, fetchMock, sleeps } = setup([
      new Response("{}", { status: 503 }),
      new Response("{}", { status: 503 }),
      new Response("{}", { status: 503 }),
    ]);

    expect(await run()).toEqual({
      ok: false,
      error: { code: "unavailable", status: 503 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(sleeps).toEqual([BACKOFF_BASE_MS, BACKOFF_BASE_MS * 2]);
  });

  it("adds jitter, always below the jitter limit", async () => {
    const fetchMock = scripted([
      new Response("{}", { status: 500 }),
      json({ value: 1 }),
    ]);
    const sleeps: number[] = [];

    await requestJson(
      { url, headers: {}, schema, timeoutMs: 1000 },
      {
        fetch: fetchMock,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        random: () => 0.999,
      },
    );

    expect(sleeps[0]).toBeGreaterThanOrEqual(BACKOFF_BASE_MS);
    expect(sleeps[0]).toBeLessThan(BACKOFF_BASE_MS + BACKOFF_JITTER_MS);
  });

  it("retries a 429 and a network error", async () => {
    const { run, fetchMock } = setup([
      new Response("{}", { status: 429 }),
      new TypeError("fetch failed"),
      json({ value: 2 }),
    ]);

    expect(await run()).toEqual({ ok: true, value: { value: 2 } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports a null status when every try was a network error", async () => {
    const { run } = setup([
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
    ]);

    expect(await run()).toEqual({
      ok: false,
      error: { code: "unavailable", status: null },
    });
  });

  it("honours Retry-After in seconds", async () => {
    const { run, sleeps } = setup([
      new Response("{}", { status: 429, headers: { "retry-after": "3" } }),
      json({ value: 1 }),
    ]);

    await run();

    expect(sleeps).toEqual([3000]);
  });

  it("caps Retry-After at the cap", async () => {
    const { run, sleeps } = setup([
      new Response("{}", { status: 429, headers: { "retry-after": "600" } }),
      json({ value: 1 }),
    ]);

    await run();

    expect(sleeps).toEqual([RETRY_AFTER_CAP_MS]);
  });

  it("cuts Retry-After to the time left before the deadline", async () => {
    const { run, sleeps } = setup(
      [
        new Response("{}", { status: 429, headers: { "retry-after": "8" } }),
        json({ value: 1 }),
      ],
      2500,
    );

    await run();

    expect(sleeps).toEqual([2500]);
  });

  it("does not start a retry once the deadline has passed", async () => {
    const { run, fetchMock, sleeps } = setup(
      [new Response("{}", { status: 500 }), json({ value: 1 })],
      0,
    );

    expect(await run()).toEqual({
      ok: false,
      error: { code: "unavailable", status: 500 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("puts no header, url or body into an error", async () => {
    const { run } = setup([
      new Response("secret-token leaked in body", { status: 500 }),
      new Response("secret-token leaked in body", { status: 500 }),
      new Response("secret-token leaked in body", { status: 500 }),
    ]);

    const result = await run();

    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(JSON.stringify(result)).not.toContain("provider.example.test");
  });

  it("sends the headers and body it was given with the chosen method", async () => {
    const fetchMock = scripted([json({ value: 1 })]);

    await requestJson(
      {
        url,
        method: "POST",
        headers: { Authorization: "Bearer secret-token" },
        body: '{"a":1}',
        schema,
        timeoutMs: 1000,
      },
      { fetch: fetchMock },
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toEqual({ Authorization: "Bearer secret-token" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

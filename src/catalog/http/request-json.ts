import type { z } from "zod";
import { err, ok, type Result } from "@/lib/result";

/**
 * One HTTP call with the retry rules every catalog provider shares (spec 0003,
 * AC-15): a timeout per try, 3 tries in total, backoff of `500 ms * 2^attempt`
 * plus jitter, `Retry-After` honoured but capped, and the answer parsed with Zod.
 *
 * It never puts a header, a URL, or a response body into an error (AC-16).
 */

/** Total tries per call: the first plus two retries. */
export const MAX_ATTEMPTS = 3;
/** Backoff before retry n (counting from 0) is `500 ms * 2^n` plus jitter. */
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_JITTER_MS = 250;
/** A `Retry-After` wait is never longer than this, or than the time left. */
export const RETRY_AFTER_CAP_MS = 10_000;

export type HttpFailure =
  /** 401 or 403. */
  | { code: "unauthorized" }
  /** 404. */
  | { code: "not_found" }
  /** The response was not JSON of the expected shape. */
  | { code: "bad_shape" }
  /** Another 4xx: a retry would not help. */
  | { code: "rejected"; status: number }
  /** 429, 5xx, timeout or network error on every try. `status` is null for a network error. */
  | { code: "unavailable"; status: number | null };

export type HttpRuntime = {
  /** Replaceable for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Replaceable for tests. Waits this many milliseconds. */
  sleep?: (ms: number) => Promise<void>;
  /** Replaceable for tests. Returns a number in [0, 1). */
  random?: () => number;
  /** Replaceable for tests. Milliseconds since the epoch. */
  now?: () => number;
};

export type JsonRequest<S extends z.ZodType> = {
  url: URL;
  method?: "GET" | "POST";
  headers: Record<string, string>;
  /** Already serialized JSON for a POST. */
  body?: string;
  schema: S;
  timeoutMs: number;
  /** Epoch milliseconds after which no retry starts. Omit for no limit. */
  deadline?: number;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reads `Retry-After` as seconds or as an HTTP date. Returns milliseconds, or null. */
function parseRetryAfter(value: string | null, now: number): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  if (value.trim() !== "" && Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/** Frees the connection of a response we do not read. */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Already closed. Nothing to free.
  }
}

/** Sends the request and parses the answer. Expected failures are returned, not thrown. */
export async function requestJson<S extends z.ZodType>(
  request: JsonRequest<S>,
  runtime: HttpRuntime = {},
): Promise<Result<z.infer<S>, HttpFailure>> {
  const doFetch = runtime.fetch ?? fetch;
  const sleep = runtime.sleep ?? defaultSleep;
  const random = runtime.random ?? Math.random;
  const now = runtime.now ?? Date.now;

  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let retryAfterMs: number | null = null;
    try {
      const response = await doFetch(request.url, {
        method: request.method ?? "GET",
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      const { status } = response;

      if (response.ok) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return err({ code: "bad_shape" });
        }
        const parsed = request.schema.safeParse(body);
        return parsed.success ? ok(parsed.data) : err({ code: "bad_shape" });
      }

      retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after"),
        now(),
      );
      await discardBody(response);
      if (status === 401 || status === 403)
        return err({ code: "unauthorized" });
      if (status === 404) return err({ code: "not_found" });
      if (status !== 429 && status < 500) {
        return err({ code: "rejected", status });
      }
      lastStatus = status;
    } catch {
      // Timeout or network error: counts as a failed try.
      lastStatus = null;
    }

    if (attempt === MAX_ATTEMPTS - 1) break;
    const timeLeft =
      request.deadline === undefined
        ? Number.POSITIVE_INFINITY
        : request.deadline - now();
    if (timeLeft <= 0) break;

    const backoff =
      BACKOFF_BASE_MS * 2 ** attempt + Math.floor(random() * BACKOFF_JITTER_MS);
    const wait =
      retryAfterMs === null
        ? backoff
        : Math.min(retryAfterMs, RETRY_AFTER_CAP_MS, timeLeft);
    await sleep(wait);
  }
  return err({ code: "unavailable", status: lastStatus });
}

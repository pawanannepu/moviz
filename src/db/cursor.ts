import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";

/** Default and maximum page size for every list function (spec 0002, AC-16). */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export type InvalidCursor = { code: "invalid_cursor" };

/** The sort key of the last row on a page: a timestamp as text, then the row id. */
export type CursorPosition = { timestamp: string; id: number };

// What Postgres prints for a timestamptz: "2026-11-08 04:00:00.123456+00".
const TIMESTAMP_TEXT =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;

const payloadSchema = z.object({
  t: z.string().regex(TIMESTAMP_TEXT),
  id: z.number().int().safe(),
});

/**
 * Encodes a page position as an opaque string. The timestamp stays as the text
 * Postgres printed (`updated_at::text`, full microsecond precision), never a
 * JavaScript `Date`, which would cut it to milliseconds and skip or repeat rows.
 */
export function encodeCursor(position: CursorPosition): string {
  const json = JSON.stringify({ t: position.timestamp, id: position.id });
  return Buffer.from(json, "utf8").toString("base64url");
}

/** Decodes and validates a cursor from the client. Anything else is `invalid_cursor`. */
export function decodeCursor(
  cursor: string,
): Result<CursorPosition, InvalidCursor> {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = payloadSchema.safeParse(JSON.parse(json));
    if (!parsed.success) return err({ code: "invalid_cursor" });
    return ok({ timestamp: parsed.data.t, id: parsed.data.id });
  } catch {
    return err({ code: "invalid_cursor" });
  }
}

/** Applies the default and the maximum to a requested page size. */
export function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)));
}

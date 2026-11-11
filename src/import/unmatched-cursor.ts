import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";

export type InvalidUnmatchedCursor = { code: "invalid_cursor" };

const payload = z.object({ r: z.number().int().positive() });

/**
 * The opaque cursor for the not matched list (spec 0009, AC-11): base64url of
 * `{ r: <last row_number returned> }`. The shared cursor in `src/db/cursor.ts`
 * is built for timestamps; this list pages on the row number alone.
 */
export function encodeUnmatchedCursor(lastRowNumber: number): string {
  return Buffer.from(JSON.stringify({ r: lastRowNumber })).toString(
    "base64url",
  );
}

/** Reads a cursor back. Anything that is not a cursor this module made is `invalid_cursor`. */
export function decodeUnmatchedCursor(
  cursor: string,
): Result<number, InvalidUnmatchedCursor> {
  try {
    const json: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    const parsed = payload.safeParse(json);
    return parsed.success ? ok(parsed.data.r) : err({ code: "invalid_cursor" });
  } catch {
    return err({ code: "invalid_cursor" });
  }
}

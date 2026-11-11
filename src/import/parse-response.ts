import { IMPORT_ERROR_CODES, type ImportErrorCode } from "./messages";

/** What the browser learns from one answer of the import endpoint. */
export type ImportAnswer =
  | { kind: "success"; matched: number; total: number }
  | { kind: "error"; code: ImportErrorCode; resetAt?: Date };

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * Turns the HTTP status and the JSON body (or null when the body was not JSON)
 * into an answer the form can show (spec 0009, AC-3, AC-7). Replies that are not
 * ours are mapped here: Vercel's own 413 for a body over its limit is
 * `file_too_large`, a 401 is `unauthenticated`, and anything else we do not
 * recognise, such as a 504 at the time limit, is `db_unavailable`. Pure.
 */
export function parseImportAnswer(status: number, body: unknown): ImportAnswer {
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    if (
      record.ok === true &&
      isCount(record.rowsMatched) &&
      isCount(record.rowsTotal)
    ) {
      return {
        kind: "success",
        matched: record.rowsMatched,
        total: record.rowsTotal,
      };
    }
    if (
      record.ok === false &&
      typeof record.error === "string" &&
      (IMPORT_ERROR_CODES as readonly string[]).includes(record.error)
    ) {
      const code = record.error as ImportErrorCode;
      const resetAt =
        typeof record.resetAt === "string" ? new Date(record.resetAt) : null;
      return {
        kind: "error",
        code,
        ...(resetAt && !Number.isNaN(resetAt.getTime()) ? { resetAt } : {}),
      };
    }
  }
  if (status === 413) return { kind: "error", code: "file_too_large" };
  if (status === 401) return { kind: "error", code: "unauthenticated" };
  return { kind: "error", code: "db_unavailable" };
}

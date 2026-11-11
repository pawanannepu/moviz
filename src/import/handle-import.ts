import type { ActionUserResult } from "@/auth/session";
import { matchMovies } from "@/catalog/match/match-movies";
import type { Db } from "@/db/create-db";
import { toDbFailure, unexpectedDbError } from "@/db/failure";
import {
  FORM_OVERHEAD_BYTES,
  MAX_FILE_BYTES,
  MAX_IMPORTS_PER_DAY,
} from "./constants";
import { IMPORT_ERROR_STATUS, type ImportErrorCode } from "./messages";
import { parseLetterboxd } from "./parse-letterboxd";
import { planImport, rowsToMatch } from "./plan-import";
import { evaluateRow } from "./row-rules";
import { countImportsToday, saveImportResult } from "./save-import-result";

/** Everything the handler reaches outside itself, so tests can pass fakes. */
export type ImportDeps = {
  db: Db;
  /** The live session's user, as `getUserForAction` reports it. */
  getUser: () => Promise<ActionUserResult>;
  /** The origins a POST may come from (`trustedOrigins()` from `src/auth/auth.ts`). */
  trustedOrigins: readonly string[];
  /** The one clock read for the pure row rules. */
  now?: () => Date;
  /** Where the one summary line goes. It holds counts and codes only. */
  log?: (line: string) => void;
};

/** The body of a good response (spec 0009, API surface). */
export type ImportSuccessBody = {
  ok: true;
  importId: number;
  rowsTotal: number;
  rowsMatched: number;
  rowsUnmatched: number;
  onboarded: boolean;
};

/** The body of every error response. `resetAt` (ISO 8601 UTC) comes only with `daily_limit`. */
export type ImportErrorBody = {
  ok: false;
  error: ImportErrorCode;
  resetAt?: string;
};

function fail(code: ImportErrorCode, resetAt?: Date): Response {
  const body: ImportErrorBody = {
    ok: false,
    error: code,
    ...(resetAt ? { resetAt: resetAt.toISOString() } : {}),
  };
  return Response.json(body, { status: IMPORT_ERROR_STATUS[code] });
}

/**
 * The body of `POST /api/import/letterboxd` (spec 0009). In order: the live
 * session, the `Origin` check, the size checks, the daily cap, the zip check,
 * parsing, the row rules, one matcher call, then one transaction. Every refusal
 * before the transaction writes nothing. No title, score, movie id or file
 * content reaches the log or an error body (AC-13).
 */
export async function handleImport(
  request: Request,
  deps: ImportDeps,
): Promise<Response> {
  const startedAt = Date.now();
  const log = deps.log ?? ((line: string) => console.info(line));
  const done = (outcome: string, counts?: Record<string, number>) =>
    log(
      JSON.stringify({
        type: "import",
        outcome,
        ms: Date.now() - startedAt,
        ...counts,
      }),
    );
  const refuse = (code: ImportErrorCode, resetAt?: Date) => {
    done(code);
    return fail(code, resetAt);
  };

  const session = await deps.getUser();
  if (!session.ok) return refuse("unauthenticated");
  const userId = session.user.id;

  const origin = request.headers.get("origin");
  if (!origin || !deps.trustedOrigins.includes(origin)) {
    return refuse("bad_origin");
  }

  const declared = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declared) &&
    declared > MAX_FILE_BYTES + FORM_OVERHEAD_BYTES
  ) {
    return refuse("file_too_large");
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return refuse("no_file");
  }
  if (!(file instanceof File)) return refuse("no_file");
  if (file.size > MAX_FILE_BYTES) return refuse("file_too_large");

  // A cheap early refusal. `saveImportResult` checks again under the lock.
  try {
    const today = await countImportsToday(deps.db, userId);
    if (today.count >= MAX_IMPORTS_PER_DAY) {
      return refuse("daily_limit", today.resetAt);
    }
  } catch (error) {
    if (toDbFailure(error)) return refuse("db_unavailable");
    throw unexpectedDbError("handleImport", error);
  }

  const parsed = parseLetterboxd(new Uint8Array(await file.arrayBuffer()));
  if (!parsed.ok) return refuse(parsed.error.code);

  const now = (deps.now ?? (() => new Date()))();
  const evaluated = parsed.value.map((row) => evaluateRow(row, now));
  const toMatch = rowsToMatch(evaluated);
  const matched = await matchMovies(
    deps.db,
    toMatch.map((row) => ({ title: row.title, year: row.year })),
  );
  if (!matched.ok) return refuse("db_unavailable");

  const plan = planImport(evaluated, matched.value);
  const saved = await saveImportResult(deps.db, { userId, plan });
  if (!saved.ok) {
    const { error } = saved;
    if (error.code === "daily_limit")
      return refuse("daily_limit", error.resetAt);
    return refuse(
      error.code === "user_not_found" ? "unauthenticated" : "db_unavailable",
    );
  }

  const { importId, rowsTotal, rowsMatched, rowsUnmatched, onboarded } =
    saved.value;
  done("ok", { rowsTotal, rowsMatched, rowsUnmatched });
  const body: ImportSuccessBody = {
    ok: true,
    importId,
    rowsTotal,
    rowsMatched,
    rowsUnmatched,
    onboarded,
  };
  return Response.json(body);
}

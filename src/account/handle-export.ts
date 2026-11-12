import { logAuthEvent } from "@/auth/log-auth-event";
import type { ActionUserResult } from "@/auth/session";
import type { Db } from "@/db/create-db";
import type { Result } from "@/lib/result";
import type {
  ExportUserDataError,
  UserExport,
} from "@/user-data/export-user-data";

/** Everything the export handler reaches outside itself, so tests can pass fakes. */
export type ExportDeps = {
  db: Db;
  /** The live session's user, as `getUserForAction` reports it. */
  getUser: () => Promise<ActionUserResult>;
  /** `exportUserData` from spec 0002. */
  exportData: (
    db: Db,
    input: { userId: string },
  ) => Promise<Result<UserExport, ExportUserDataError>>;
  /** Where the one log line goes. Defaults to `logAuthEvent`. */
  log?: typeof logAuthEvent;
};

/** The error codes the export route returns. */
export type ExportErrorCode = "unauthenticated" | "db_unavailable";

/** Never cache: the body is one person's data. */
const NO_STORE = { "Cache-Control": "no-store" } as const;

function fail(code: ExportErrorCode): Response {
  return Response.json(
    { ok: false, error: code },
    { status: code === "unauthenticated" ? 401 : 503, headers: NO_STORE },
  );
}

/** The download name, dated from the document's own `exportedAt` (UTC). */
export function exportFileName(exportedAt: string): string {
  return `moviz-data-${exportedAt.slice(0, 10)}.json`;
}

/**
 * The body of `GET /api/account/export` (spec 0014, AC-7). Reads the live
 * session, builds the export for that user only, and returns it as a JSON
 * attachment that is never cached. One log line holds the event, the outcome
 * and the user id, and nothing from the export (AC-14).
 */
export async function handleExport(deps: ExportDeps): Promise<Response> {
  const log = deps.log ?? logAuthEvent;
  const session = await deps.getUser();
  if (!session.ok) {
    log({ event: "data_exported", outcome: "unauthenticated" });
    return fail("unauthenticated");
  }
  const userId = session.user.id;

  let result: Awaited<ReturnType<ExportDeps["exportData"]>>;
  try {
    result = await deps.exportData(deps.db, { userId });
  } catch {
    // An unexpected database error still answers 503, never a raw 500.
    log({ event: "data_exported", outcome: "db_unavailable", userId });
    return fail("db_unavailable");
  }
  if (!result.ok) {
    log({ event: "data_exported", outcome: result.error.code, userId });
    // A user gone mid request has no session worth honoring.
    return fail(
      result.error.code === "user_not_found"
        ? "unauthenticated"
        : "db_unavailable",
    );
  }

  log({ event: "data_exported", outcome: "ok", userId });
  return new Response(JSON.stringify(result.value, null, 2), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${exportFileName(result.value.exportedAt)}"`,
    },
  });
}

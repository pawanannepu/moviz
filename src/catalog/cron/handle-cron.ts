import { createVoyageClient } from "@/catalog/embedding/voyage-client";
import { runCatalogSync } from "@/catalog/sync/run-catalog-sync";
import { createTmdbClient } from "@/catalog/tmdb/client";
import type { Db } from "@/db/create-db";
import { type PurgedCounts, purgeOldRows } from "@/user-data/purge-old-rows";
import { isAuthorizedCron } from "./authorize";

export type CronContext = {
  db: Db;
  /** `CRON_SECRET`. */
  cronSecret: string | undefined;
  /** `TMDB_API_TOKEN`. */
  tmdbToken: string | undefined;
  /** `VOYAGE_API_KEY`. */
  voyageKey: string | undefined;
  /** Replaceable for tests. Used for every TMDB and Voyage call. */
  fetch?: typeof fetch;
  /** Replaceable for tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Replaceable for tests. Receives the purge failure line. */
  warn?: (line: string) => void;
};

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * The body of `GET /api/cron/catalog` (spec 0003, AC-10). Checks the bearer
 * token first (401 for a missing or wrong one, and for any call when
 * `CRON_SECRET` is unset), then that both provider keys exist (500
 * `config_missing`, naming no variable), then runs the daily job and returns its
 * `RunSummary`. Error bodies carry a short code only: no key, no value, no
 * database detail.
 *
 * Right after the bearer check, and before the config check, it purges old
 * rows (spec 0012, AC-16), so the purge runs even when the catalog keys are
 * missing. A purge failure is logged with its code and never stops the job.
 * Every body after the bearer check, and the run's log line, carry
 * `purged`: the counts, or null when the purge failed.
 */
export async function handleCatalogCron(
  request: Request,
  context: CronContext,
): Promise<Response> {
  if (
    !isAuthorizedCron(request.headers.get("authorization"), context.cronSecret)
  ) {
    return json({ error: "unauthorized" }, 401);
  }

  const now = context.now ?? Date.now;
  const purge = await purgeOldRows(context.db, { now: now() });
  const purged: PurgedCounts | null = purge.ok ? purge.value : null;
  if (!purge.ok) {
    (context.warn ?? console.warn)(`cron purge failed (${purge.error.code})`);
  }

  if (!context.tmdbToken || !context.voyageKey) {
    return json({ error: "config_missing", purged }, 500);
  }

  const runtime = {
    fetch: context.fetch,
    now: context.now,
    sleep: context.sleep,
  };
  const result = await runCatalogSync({
    db: context.db,
    tmdb: createTmdbClient({ token: context.tmdbToken, ...runtime }),
    voyage: createVoyageClient({ apiKey: context.voyageKey, ...runtime }),
    today: new Date(now()).toISOString().slice(0, 10),
    now: context.now,
    logFields: { purged },
  });
  if (!result.ok) {
    return json(
      { error: result.error.code, summary: result.error.summary, purged },
      result.error.code === "db_unavailable" ? 503 : 500,
    );
  }
  return json({ ...result.value, purged }, 200);
}

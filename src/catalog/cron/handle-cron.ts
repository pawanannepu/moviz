import { createVoyageClient } from "@/catalog/embedding/voyage-client";
import { runCatalogSync } from "@/catalog/sync/run-catalog-sync";
import { createTmdbClient } from "@/catalog/tmdb/client";
import type { Db } from "@/db/create-db";
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
  if (!context.tmdbToken || !context.voyageKey) {
    return json({ error: "config_missing" }, 500);
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
    today: new Date((context.now ?? Date.now)()).toISOString().slice(0, 10),
    now: context.now,
  });
  if (!result.ok) {
    return json(
      { error: result.error.code, summary: result.error.summary },
      result.error.code === "db_unavailable" ? 503 : 500,
    );
  }
  return json(result.value, 200);
}

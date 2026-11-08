import { handleCatalogCron } from "@/catalog/cron/handle-cron";
import { db } from "@/db/client";
import { env } from "@/env";

// Database code runs on Node.js. One run is capped at 60 seconds; the job stops
// starting new work after 45 (spec 0003).
export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily catalog job, called by Vercel Cron with `Authorization: Bearer ${CRON_SECRET}`. */
export function GET(request: Request): Promise<Response> {
  return handleCatalogCron(request, {
    db,
    cronSecret: env.CRON_SECRET,
    tmdbToken: env.TMDB_API_TOKEN,
    voyageKey: env.VOYAGE_API_KEY,
  });
}

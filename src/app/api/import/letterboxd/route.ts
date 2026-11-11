import { trustedOrigins } from "@/auth/auth";
import { getUserForAction } from "@/auth/session";
import { db } from "@/db/client";
import { handleImport } from "@/import/handle-import";

// Database code runs on Node.js. A save is capped at 45 seconds inside, so it
// ends before Vercel's 60 second limit (spec 0009).
export const runtime = "nodejs";
export const maxDuration = 60;

/** Uploads a Letterboxd `ratings.csv` and saves the matched ratings (spec 0009). */
export function POST(request: Request): Promise<Response> {
  return handleImport(request, {
    db,
    getUser: getUserForAction,
    trustedOrigins: trustedOrigins(),
  });
}

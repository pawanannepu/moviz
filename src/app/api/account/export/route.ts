import { handleExport } from "@/account/handle-export";
import { getUserForAction } from "@/auth/session";
import { db } from "@/db/client";
import { exportUserData } from "@/user-data/export-user-data";

// Database code runs on Node.js. It reads the session, so it is never static.
export const runtime = "nodejs";

/** Downloads everything Moviz holds about the signed in user (spec 0014, AC-7). */
export function GET(): Promise<Response> {
  return handleExport({
    db,
    getUser: getUserForAction,
    exportData: exportUserData,
  });
}

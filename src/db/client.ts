import { env } from "@/env";
import { createDb } from "./create-db";

/**
 * The shared Pool and Drizzle instance for the running app, also passed to
 * Better Auth. Cached on `globalThis` so dev hot reloads do not open a new
 * pool each time. Node.js runtime only.
 */
const globalForDb = globalThis as unknown as {
  moviz?: ReturnType<typeof createDb>;
};

const shared = globalForDb.moviz ?? createDb(env.DATABASE_URL);
globalForDb.moviz = shared;

export const pool = shared.pool;
export const db = shared.db;

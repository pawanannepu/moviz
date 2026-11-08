import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Builds a Drizzle instance over a `pg` Pool for one connection string.
 * No named prepared statements are used, because Neon's pooler runs in
 * transaction mode. Tests call this with the test branch URL.
 */
export function createDb(
  connectionString: string,
  options: { max?: number } = {},
) {
  const pool = new Pool({ connectionString, max: options.max ?? 5 });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

/** The Drizzle database type every data function takes as its first argument. */
export type Db = ReturnType<typeof createDb>["db"];

/** A transaction handle from `db.transaction`. Same query surface as `Db`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Either a database or a transaction: anything that can run a query. */
export type Executor = Db | Tx;

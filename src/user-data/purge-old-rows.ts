import { sql } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import { type DbUnavailable, toDbFailure } from "@/db/failure";
import { rateLimit, searchUsage, session, verification } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

/** `search_usage` rows are kept this many days (spec 0012, AC-16). Spec 0014's policy reads it. */
export const SEARCH_USAGE_KEEP_DAYS = 30;
/** Better Auth `rate_limit` rows are kept this many days after their last request. */
export const RATE_LIMIT_KEEP_DAYS = 1;
/** Expired `session` and `verification` rows are kept this many days past `expires_at`. */
export const EXPIRED_AUTH_KEEP_DAYS = 1;

/** How many rows each purge removed. Counts only. */
export type PurgedCounts = {
  searchUsage: number;
  rateLimit: number;
  session: number;
  verification: number;
};

/** Why a purge did not run. `purge_failed` is anything that is not a lost database. */
export type PurgeError = DbUnavailable | { code: "purge_failed" };

const DAY_MS = 86_400_000;

/**
 * Deletes rows that no longer serve a purpose (spec 0012, AC-16; spec 0002):
 * `search_usage` days older than `SEARCH_USAGE_KEEP_DAYS` (UTC), `rate_limit`
 * rows whose `last_request` (epoch milliseconds) is older than
 * `RATE_LIMIT_KEEP_DAYS`, and `session` and `verification` rows more than
 * `EXPIRED_AUTH_KEEP_DAYS` past `expires_at`, because Better Auth does not
 * purge them. `now` is the clock in epoch milliseconds. Returns counts only.
 * The daily cron calls it right after its bearer check.
 */
export async function purgeOldRows(
  db: Db,
  input: { now: number },
): Promise<Result<PurgedCounts, PurgeError>> {
  const now = new Date(input.now);
  const authCutoff = new Date(input.now - EXPIRED_AUTH_KEEP_DAYS * DAY_MS);
  try {
    const counts = await db.transaction(async (tx) => {
      const usage = await tx.execute(sql`
        delete from ${searchUsage}
        where ${searchUsage.day}
          < (${now.toISOString()}::timestamptz at time zone 'utc')::date - ${SEARCH_USAGE_KEEP_DAYS}::int
      `);
      const limits = await tx.execute(sql`
        delete from ${rateLimit}
        where ${rateLimit.lastRequest}
          < ${input.now - RATE_LIMIT_KEEP_DAYS * DAY_MS}::bigint
      `);
      // Better Auth's columns are `timestamp` without a time zone, written in UTC.
      const cutoff = sql`(${authCutoff.toISOString()}::timestamptz at time zone 'utc')`;
      const sessions = await tx.execute(sql`
        delete from ${session} where ${session.expiresAt} < ${cutoff}
      `);
      const verifications = await tx.execute(sql`
        delete from ${verification} where ${verification.expiresAt} < ${cutoff}
      `);
      return {
        searchUsage: usage.rowCount ?? 0,
        rateLimit: limits.rowCount ?? 0,
        session: sessions.rowCount ?? 0,
        verification: verifications.rowCount ?? 0,
      };
    });
    return ok(counts);
  } catch (error) {
    const failure = toDbFailure(error);
    // Never rethrown: the error could carry query parameters, and a purge must
    // never stop the catalog job.
    return err(
      failure?.code === "db_unavailable" ? failure : { code: "purge_failed" },
    );
  }
}

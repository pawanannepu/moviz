import { sql } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import {
  type DbUnavailable,
  toDbFailure,
  type UserNotFound,
  unexpectedDbError,
} from "@/db/failure";
import { searchUsage } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import { SEARCH_DAILY_LIMIT } from "./constants";
import type { QuotaExceeded } from "./types";

type QuotaRow = { count: number | null; next_day: string };

/**
 * Spends one of the user's daily searches (spec 0002, AC-11; spec 0012, AC-3).
 * One atomic statement: it inserts or adds one to today's row, and only while
 * the count is under `SEARCH_DAILY_LIMIT`, so 40 calls at once still let 30
 * through. The day is the UTC day in SQL, never a client clock. No row back
 * means refused, with `resetsAt` at the next UTC midnight. It runs outside any
 * transaction, so a charge commits at once and is never refunded.
 */
export async function consumeSearchQuota(
  db: Db,
  input: { userId: string },
): Promise<
  Result<{ remaining: number }, QuotaExceeded | UserNotFound | DbUnavailable>
> {
  try {
    const result = await db.execute<QuotaRow>(sql`
      with today as (
        select (now() at time zone 'utc')::date as day
      ),
      charged as (
        insert into ${searchUsage} (user_id, day, count)
        select ${input.userId}::text, today.day, 1 from today
        on conflict (user_id, day) do update
          set count = ${searchUsage}.count + 1
          where ${searchUsage}.count < ${SEARCH_DAILY_LIMIT}
        returning count
      )
      select
        (select count from charged) as count,
        ((select day from today) + 1)::text as next_day
    `);
    const row = result.rows[0];
    if (!row || row.count === null) {
      return err({
        code: "quota_exceeded",
        resetsAt: `${row?.next_day}T00:00:00.000Z`,
      });
    }
    return ok({ remaining: SEARCH_DAILY_LIMIT - Number(row.count) });
  } catch (error) {
    const failure = toDbFailure(error);
    if (
      failure?.code === "db_unavailable" ||
      failure?.code === "user_not_found"
    ) {
      return err(failure);
    }
    throw unexpectedDbError("consumeSearchQuota", error);
  }
}

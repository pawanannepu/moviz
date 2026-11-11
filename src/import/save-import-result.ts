import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { lockUserImport } from "@/db/advisory-lock";
import type { Db, Executor } from "@/db/create-db";
import {
  type DbUnavailable,
  toDbFailure,
  type UserNotFound,
  unexpectedDbError,
} from "@/db/failure";
import {
  imports,
  importUnmatchedRows,
  profiles,
  ratings,
  swipeSkips,
} from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import { MIN_RATED } from "@/onboarding/deck-rules";
import {
  CHUNK_SIZE,
  KEEP_IMPORTS,
  MAX_IMPORTS_PER_DAY,
  SAVE_BUDGET_MS,
  STATEMENT_TIMEOUT_MS,
} from "./constants";
import type { ImportPlan, UnmatchedRow } from "./plan-import";

/** What a good import returns. The counts are the final ones, after hand rated movies were set aside. */
export type SavedImport = {
  importId: number;
  rowsTotal: number;
  rowsMatched: number;
  rowsUnmatched: number;
  /** True when `profiles.onboarded_at` is set after the save. */
  onboarded: boolean;
};

export type SaveImportError =
  | { code: "daily_limit"; resetAt: Date }
  | UserNotFound
  | DbUnavailable;

export type SaveImportOptions = {
  /** How long the whole save may run. Tests shorten it. */
  budgetMs?: number;
  /** The clock for the budget, in milliseconds. */
  nowMs?: () => number;
};

/** A rule inside the transaction refused to go on, so everything rolls back. Carries no row data. */
class ImportAborted extends Error {
  constructor(readonly reason: "time_budget" | "row_count" | "counts") {
    super(`import aborted: ${reason}`);
  }
}

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += CHUNK_SIZE) {
    out.push(items.slice(start, start + CHUNK_SIZE));
  }
  return out;
}

/** True when Postgres cancelled a statement because it ran past `statement_timeout`. */
function isStatementTimeout(error: unknown): boolean {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && typeof current === "object" && current;
    depth++
  ) {
    if ((current as { code?: unknown }).code === "57014") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * How many imports the user has saved so far today (UTC day), and when the
 * limit lifts (the next UTC midnight). The day and the reset come from the
 * database clock, never from the client or the server's own.
 */
export async function countImportsToday(
  executor: Executor,
  userId: string,
): Promise<{ count: number; resetAt: Date }> {
  const result = await executor.execute<{ n: number; reset_at: string }>(sql`
    select
      (select count(*)::int from imports
        where user_id = ${userId}::text
          and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')) as n,
      to_char(date_trunc('day', now() at time zone 'utc') + interval '1 day',
              'YYYY-MM-DD"T"HH24:MI:SS"Z"') as reset_at
  `);
  const row = result.rows[0];
  return { count: Number(row?.n ?? 0), resetAt: new Date(row?.reset_at ?? "") };
}

/**
 * Stores one `failed` import after the save rolled back, and in the same
 * statement keeps only the user's latest KEEP_IMPORTS. Best effort: it never
 * throws, because the user is already getting an error. `rows_total` is what was
 * parsed; the other counts are 0.
 */
async function recordFailedImport(
  db: Db,
  userId: string,
  rowsTotal: number,
): Promise<void> {
  try {
    await db.execute(sql`
      with inserted as (
        insert into imports (user_id, status, rows_total, rows_matched, rows_unmatched)
        values (${userId}::text, 'failed', ${rowsTotal}::int, 0, 0)
        returning id
      )
      delete from imports
      where user_id = ${userId}::text
        and id not in (
          select id from imports where user_id = ${userId}::text
          order by created_at desc, id desc
          limit ${KEEP_IMPORTS - 1}
        )
    `);
  } catch {
    // The database is likely down, which is why the save failed. Nothing to add.
  }
}

/**
 * Saves a planned import in one transaction (spec 0009, AC-1 to AC-10, AC-17).
 *
 * In order, under the exclusive per user import lock, a statement timeout and a
 * time budget checked before every chunk:
 * 1. Re check the daily cap. At the cap it returns `daily_limit` and writes nothing.
 * 2. Set aside every planned movie the user rated by hand (`kept_manual`), and
 *    work out the final counts.
 * 3. Insert the `imports` row, upsert the ratings in chunks (never over a
 *    `manual` rating), delete the matching skips, insert the unmatched rows.
 * 4. Keep only the latest KEEP_IMPORTS, and mark the user onboarded when they now
 *    have MIN_RATED ratings.
 *
 * Any failure after the cap check rolls everything back and stores one `failed`
 * import. A user deleted mid import returns `user_not_found` and stores nothing.
 */
export async function saveImportResult(
  db: Db,
  input: { userId: string; plan: ImportPlan },
  options: SaveImportOptions = {},
): Promise<Result<SavedImport, SaveImportError>> {
  const { userId, plan } = input;
  const budgetMs = options.budgetMs ?? SAVE_BUDGET_MS;
  const nowMs = options.nowMs ?? Date.now;

  try {
    const outcome = await db.transaction(async (tx) => {
      const startedAt = nowMs();
      const checkBudget = () => {
        if (nowMs() - startedAt > budgetMs)
          throw new ImportAborted("time_budget");
      };

      await tx.execute(
        sql`select set_config('statement_timeout', ${String(STATEMENT_TIMEOUT_MS)}, true)`,
      );
      await lockUserImport(tx, userId);

      const today = await countImportsToday(tx, userId);
      if (today.count >= MAX_IMPORTS_PER_DAY) {
        return { kind: "limit", resetAt: today.resetAt } as const;
      }

      // A hand rated movie is never changed by an import.
      const manualIds = new Set<number>();
      for (const part of chunks(plan.ratings.map((r) => r.movieId))) {
        checkBudget();
        const found = await tx
          .select({ movieId: ratings.movieId })
          .from(ratings)
          .where(
            and(
              eq(ratings.userId, userId),
              eq(ratings.source, "manual"),
              inArray(ratings.movieId, part),
            ),
          );
        for (const row of found) manualIds.add(row.movieId);
      }
      const toSave = plan.ratings.filter((r) => !manualIds.has(r.movieId));
      const kept: UnmatchedRow[] = plan.ratings
        .filter((r) => manualIds.has(r.movieId))
        .map((r) => ({
          rowNumber: r.rowNumber,
          title: r.title,
          year: r.year,
          score: r.score,
          reason: "kept_manual",
        }));
      const unmatched = [...plan.unmatched, ...kept].sort(
        (a, b) => a.rowNumber - b.rowNumber,
      );
      const rowsMatched = toSave.length;
      const rowsUnmatched = unmatched.length;
      if (rowsMatched + rowsUnmatched !== plan.rowsTotal) {
        throw new ImportAborted("counts");
      }

      const [created] = await tx
        .insert(imports)
        .values({
          userId,
          status: "completed",
          rowsTotal: plan.rowsTotal,
          rowsMatched,
          rowsUnmatched,
          completedAt: sql`now()`,
        })
        .returning({ id: imports.id });
      if (!created) throw new ImportAborted("counts");
      const importId = created.id;

      let written = 0;
      for (const part of chunks(toSave)) {
        checkBudget();
        const saved = await tx
          .insert(ratings)
          .values(
            part.map((r) => ({
              userId,
              movieId: r.movieId,
              score: r.score,
              source: "import" as const,
              ratedAt: r.ratedAt ?? sql`now()`,
            })),
          )
          .onConflictDoUpdate({
            target: [ratings.userId, ratings.movieId],
            // `rated_at` is left alone: it keeps the first time the movie was rated.
            set: {
              score: sql`excluded.score`,
              source: "import",
              updatedAt: sql`now()`,
            },
            setWhere: ne(ratings.source, "manual"),
          })
          .returning({ movieId: ratings.movieId });
        written += saved.length;
        await tx.delete(swipeSkips).where(
          and(
            eq(swipeSkips.userId, userId),
            inArray(
              swipeSkips.movieId,
              part.map((r) => r.movieId),
            ),
          ),
        );
      }
      if (written !== toSave.length) throw new ImportAborted("row_count");

      for (const part of chunks(unmatched)) {
        checkBudget();
        await tx.insert(importUnmatchedRows).values(
          part.map((row) => ({
            importId,
            rowNumber: row.rowNumber,
            title: row.title,
            year: row.year,
            score: row.score,
            reason: row.reason,
          })),
        );
      }

      await tx.execute(sql`
        delete from imports
        where user_id = ${userId}::text
          and id not in (
            select id from imports where user_id = ${userId}::text
            order by created_at desc, id desc
            limit ${KEEP_IMPORTS}
          )
      `);

      const [total] = await tx
        .select({ n: count() })
        .from(ratings)
        .where(eq(ratings.userId, userId));
      if ((total?.n ?? 0) >= MIN_RATED) {
        // Zero rows updated (no profile row) is fine: the import never fails over it.
        await tx
          .update(profiles)
          .set({
            onboardedAt: sql`coalesce(${profiles.onboardedAt}, now())`,
            updatedAt: sql`case when ${profiles.onboardedAt} is null then now() else ${profiles.updatedAt} end`,
          })
          .where(eq(profiles.userId, userId));
      }
      const [profile] = await tx
        .select({ onboardedAt: profiles.onboardedAt })
        .from(profiles)
        .where(eq(profiles.userId, userId));

      return {
        kind: "saved",
        value: {
          importId,
          rowsTotal: plan.rowsTotal,
          rowsMatched,
          rowsUnmatched,
          onboarded: Boolean(profile?.onboardedAt),
        } satisfies SavedImport,
      } as const;
    });

    if (outcome.kind === "limit") {
      return err({ code: "daily_limit", resetAt: outcome.resetAt });
    }
    return ok(outcome.value);
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "user_not_found") return err(failure);
    await recordFailedImport(db, userId, plan.rowsTotal);
    if (
      failure ||
      error instanceof ImportAborted ||
      isStatementTimeout(error)
    ) {
      return err({ code: "db_unavailable" });
    }
    throw unexpectedDbError("saveImportResult", error);
  }
}

import { eq, or, sql } from "drizzle-orm";
import type { Db, Executor } from "@/db/create-db";
import {
  type DbUnavailable,
  toDbFailure,
  type UserNotFound,
} from "@/db/failure";
import { user, verification } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

export type DeleteAccountError = UserNotFound | DbUnavailable;

/**
 * Deletes the `verification` rows that belong to a user. They are keyed by
 * `identifier`, not by user id, so the cascade from `user` never reaches them.
 * Better Auth stores the user id in `value` for password reset and delete account
 * rows, and plugins may embed the email in `identifier`. The email match is
 * case insensitive and uses `position`, not `like`, so `%` and `_` in an address
 * are plain characters.
 */
export async function deleteVerificationRows(
  executor: Executor,
  input: { userId: string; email: string },
): Promise<void> {
  const email = input.email.toLowerCase();
  await executor
    .delete(verification)
    .where(
      or(
        eq(verification.value, input.userId),
        sql`position(${email}::text in lower(${verification.identifier})) > 0`,
      ),
    );
}

/**
 * Deletes an account for good, in one transaction: the user's `verification`
 * rows first, then the `user` row. Every user owned row in every table and the
 * user's sessions go with it by `ON DELETE CASCADE`. Catalog tables are untouched.
 *
 * Feature 6 calls this from Better Auth's `deleteUser` flow (its `beforeDelete`
 * hook). Better Auth then finds the user already gone and only clears the cookie.
 * A request writing a rating for this user at the same moment gets
 * `user_not_found`. Call it only for the signed in user's own id.
 */
export async function deleteAccount(
  db: Db,
  input: { userId: string },
): Promise<Result<void, DeleteAccountError>> {
  try {
    const found = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, input.userId));
      if (!row) return false;
      await deleteVerificationRows(tx, {
        userId: input.userId,
        email: row.email,
      });
      await tx.delete(user).where(eq(user.id, input.userId));
      return true;
    });
    return found ? ok(undefined) : err({ code: "user_not_found" });
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }
}

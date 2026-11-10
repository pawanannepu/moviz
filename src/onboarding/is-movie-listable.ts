import { and, eq } from "drizzle-orm";
import { isListable } from "@/catalog/listable";
import type { Db } from "@/db/create-db";
import { type DbUnavailable, toDbFailure } from "@/db/failure";
import { movies } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

/**
 * Whether the movie exists and may still be swiped (spec 0006, AC-3). A movie
 * the catalog marked missing keeps its row, so a plain insert would still
 * succeed; this check runs before the save.
 */
export async function isMovieListable(
  db: Db,
  input: { movieId: number },
): Promise<Result<boolean, DbUnavailable>> {
  try {
    const rows = await db
      .select({ id: movies.id })
      .from(movies)
      .where(and(eq(movies.id, input.movieId), isListable()))
      .limit(1);
    return ok(rows.length > 0);
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }
}

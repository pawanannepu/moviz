import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import {
  type DbUnavailable,
  toDbFailure,
  type UserNotFound,
} from "@/db/failure";
import {
  feedFeedback,
  imports,
  importUnmatchedRows,
  movies,
  profiles,
  ratings,
  swipeSkips,
  user,
  watchlistEntries,
} from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

/**
 * The download a user gets (spec 0002, `UserExport`). Every time is an ISO 8601
 * UTC string. It never holds password hashes, session tokens, or `verification`
 * rows. Each later feature that adds a user table adds its key here (`watchlist`,
 * `feedback`, `imports`, `searchUsage`) without changing the keys below, and wires
 * the table into `deleteAccount` and the completeness test in the same change.
 */
export type UserExport = {
  schemaVersion: 1;
  exportedAt: string;
  account: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    createdAt: string;
  };
  profile: {
    country: string | null;
    countrySource: "ip" | "user" | null;
    onboardedAt: string | null;
    termsAcceptedAt: string | null;
    termsVersion: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  ratings: {
    movieId: number;
    title: string;
    year: number | null;
    /** Half stars, 0.5 to 5 (the stored score divided by 2). */
    stars: number;
    source: "swipe" | "import" | "manual";
    ratedAt: string;
    updatedAt: string;
  }[];
  watchlist: {
    movieId: number;
    title: string;
    year: number | null;
    addedAt: string;
  }[];
  skips: {
    movieId: number;
    title: string;
    year: number | null;
    skippedAt: string;
  }[];
  /** "Not interested" and "More like this" taps, newest first (spec 0011). */
  feedback: {
    movieId: number;
    title: string;
    year: number | null;
    kind: "not_interested" | "more_like_this";
    createdAt: string;
  }[];
  /** Saved Letterboxd imports, newest first, each with the rows that did not become ratings (spec 0009). */
  imports: {
    id: number;
    status: "completed" | "failed";
    rowsTotal: number;
    rowsMatched: number;
    rowsUnmatched: number;
    createdAt: string;
    completedAt: string | null;
    unmatched: {
      rowNumber: number;
      title: string;
      year: number | null;
      /** Half stars, 0.5 to 5 (the stored score divided by 2), or null. */
      stars: number | null;
      reason:
        | "no_match"
        | "ambiguous"
        | "invalid_row"
        | "duplicate"
        | "kept_manual";
    }[];
  }[];
};

export type ExportUserDataError = UserNotFound | DbUnavailable;

const iso = (date: Date) => date.toISOString();

/**
 * Builds the user's whole export. All reads run in one repeatable read, read only
 * transaction, so the document is a consistent snapshot even if the user rates a
 * movie mid export. Contains only rows for `userId`.
 */
export async function exportUserData(
  db: Db,
  input: { userId: string },
): Promise<Result<UserExport, ExportUserDataError>> {
  const { userId } = input;
  try {
    const result = await db.transaction(
      async (tx) => {
        const [account] = await tx
          .select({
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
            createdAt: user.createdAt,
          })
          .from(user)
          .where(eq(user.id, userId));
        if (!account) return null;

        const [profile] = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.userId, userId));

        const ratingRows = await tx
          .select({
            movieId: ratings.movieId,
            title: movies.title,
            year: movies.releaseYear,
            score: ratings.score,
            source: ratings.source,
            ratedAt: ratings.ratedAt,
            updatedAt: ratings.updatedAt,
          })
          .from(ratings)
          .innerJoin(movies, eq(movies.id, ratings.movieId))
          .where(eq(ratings.userId, userId))
          .orderBy(desc(ratings.updatedAt), desc(ratings.movieId));

        const skipRows = await tx
          .select({
            movieId: swipeSkips.movieId,
            title: movies.title,
            year: movies.releaseYear,
            skippedAt: swipeSkips.skippedAt,
          })
          .from(swipeSkips)
          .innerJoin(movies, eq(movies.id, swipeSkips.movieId))
          .where(eq(swipeSkips.userId, userId))
          .orderBy(desc(swipeSkips.skippedAt), desc(swipeSkips.movieId));

        const watchlistRows = await tx
          .select({
            movieId: watchlistEntries.movieId,
            title: movies.title,
            year: movies.releaseYear,
            addedAt: watchlistEntries.addedAt,
          })
          .from(watchlistEntries)
          .innerJoin(movies, eq(movies.id, watchlistEntries.movieId))
          .where(eq(watchlistEntries.userId, userId))
          .orderBy(
            desc(watchlistEntries.addedAt),
            desc(watchlistEntries.movieId),
          );

        const feedbackRows = await tx
          .select({
            movieId: feedFeedback.movieId,
            title: movies.title,
            year: movies.releaseYear,
            kind: feedFeedback.kind,
            createdAt: feedFeedback.createdAt,
          })
          .from(feedFeedback)
          .innerJoin(movies, eq(movies.id, feedFeedback.movieId))
          .where(eq(feedFeedback.userId, userId))
          .orderBy(desc(feedFeedback.createdAt), desc(feedFeedback.movieId));

        const importRows = await tx
          .select()
          .from(imports)
          .where(eq(imports.userId, userId))
          .orderBy(desc(imports.createdAt), desc(imports.id));
        const unmatchedRows =
          importRows.length === 0
            ? []
            : await tx
                .select()
                .from(importUnmatchedRows)
                .where(
                  inArray(
                    importUnmatchedRows.importId,
                    importRows.map((row) => row.id),
                  ),
                )
                .orderBy(
                  importUnmatchedRows.importId,
                  importUnmatchedRows.rowNumber,
                );

        const document: UserExport = {
          schemaVersion: 1,
          exportedAt: iso(new Date()),
          account: {
            id: account.id,
            email: account.email,
            name: account.name,
            emailVerified: account.emailVerified,
            createdAt: iso(account.createdAt),
          },
          profile: profile
            ? {
                country: profile.country,
                countrySource: profile.countrySource,
                onboardedAt: profile.onboardedAt && iso(profile.onboardedAt),
                termsAcceptedAt:
                  profile.termsAcceptedAt && iso(profile.termsAcceptedAt),
                termsVersion: profile.termsVersion,
                createdAt: iso(profile.createdAt),
                updatedAt: iso(profile.updatedAt),
              }
            : null,
          ratings: ratingRows.map((row) => ({
            movieId: row.movieId,
            title: row.title,
            year: row.year,
            stars: row.score / 2,
            source: row.source,
            ratedAt: iso(row.ratedAt),
            updatedAt: iso(row.updatedAt),
          })),
          skips: skipRows.map((row) => ({
            movieId: row.movieId,
            title: row.title,
            year: row.year,
            skippedAt: iso(row.skippedAt),
          })),
          watchlist: watchlistRows.map((row) => ({
            movieId: row.movieId,
            title: row.title,
            year: row.year,
            addedAt: iso(row.addedAt),
          })),
          feedback: feedbackRows.map((row) => ({
            movieId: row.movieId,
            title: row.title,
            year: row.year,
            kind: row.kind,
            createdAt: iso(row.createdAt),
          })),
          imports: importRows.map((row) => ({
            id: row.id,
            status: row.status,
            rowsTotal: row.rowsTotal,
            rowsMatched: row.rowsMatched,
            rowsUnmatched: row.rowsUnmatched,
            createdAt: iso(row.createdAt),
            completedAt: row.completedAt && iso(row.completedAt),
            unmatched: unmatchedRows
              .filter((unmatched) => unmatched.importId === row.id)
              .map((unmatched) => ({
                rowNumber: unmatched.rowNumber,
                title: unmatched.title,
                year: unmatched.year,
                stars: unmatched.score === null ? null : unmatched.score / 2,
                reason: unmatched.reason,
              })),
          })),
        };
        return document;
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    return result ? ok(result) : err({ code: "user_not_found" });
  } catch (error) {
    const failure = toDbFailure(error);
    if (failure?.code === "db_unavailable") return err(failure);
    throw error;
  }
}

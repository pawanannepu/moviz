import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { movies, profiles } from "@/db/schema";
import { getProfile } from "@/profile/profile";
import { saveSwipe } from "@/ratings/save-swipe";
import {
  TEST_DATABASE_URL,
  UNKNOWN_USER_ID,
  useTestDb,
} from "@/test-support/test-db";
import { finishOnboarding } from "./finish-onboarding";

describe.skipIf(!TEST_DATABASE_URL)("finishOnboarding (database)", () => {
  const t = useTestDb();

  async function userWithRatings(count: number) {
    const user = await t.fx.newUser();
    await getProfile(t.db, { userId: user.id });
    const rows = await t.fx.newMovies(count);
    await t.db
      .update(movies)
      .set({ posterPath: "/poster.jpg", voteCount: 1_999_000_000 })
      .where(
        inArray(
          movies.id,
          rows.map((row) => row.id),
        ),
      );
    for (const row of rows) {
      await saveSwipe(t.db, {
        userId: user.id,
        movieId: row.id,
        choice: "liked",
      });
    }
    return user;
  }

  const onboardedAt = async (userId: string) =>
    (await t.db.select().from(profiles).where(eq(profiles.userId, userId)))[0]
      ?.onboardedAt;

  it("refuses with fewer than 10 ratings and leaves onboarded_at empty (AC-7)", async () => {
    const user = await userWithRatings(3);
    const result = await finishOnboarding(t.db, { userId: user.id });
    expect(result).toEqual({
      ok: false,
      error: { code: "not_enough_ratings" },
    });
    expect(await onboardedAt(user.id)).toBeNull();
  });

  it("sets onboarded_at at 10 ratings, and finishing twice keeps the first time (AC-7)", async () => {
    const user = await userWithRatings(10);
    const first = await finishOnboarding(t.db, { userId: user.id });
    if (!first.ok) throw new Error(`finish failed: ${first.error.code}`);
    const second = await finishOnboarding(t.db, { userId: user.id });
    if (!second.ok)
      throw new Error(`second finish failed: ${second.error.code}`);
    expect(second.value.onboardedAt).toEqual(first.value.onboardedAt);
    expect(await onboardedAt(user.id)).toEqual(first.value.onboardedAt);
  });

  it("returns user_not_found for an account that does not exist (AC-10)", async () => {
    const result = await finishOnboarding(t.db, { userId: UNKNOWN_USER_ID });
    expect(result.ok).toBe(false);
  });
});

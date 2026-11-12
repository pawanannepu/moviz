import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { account, feedFeedback, session, swipeSkips } from "@/db/schema";
import { setFeedback } from "@/feedback/feedback";
import { upsertProfile } from "@/profile/profile";
import { saveRating } from "@/ratings/save-rating";
import { saveSwipe } from "@/ratings/save-swipe";
import {
  TEST_DATABASE_URL,
  token,
  UNKNOWN_USER_ID,
  useTestDb,
} from "@/test-support/test-db";
import { exportUserData } from "./export-user-data";
import { EXPORT_KEY_BY_TABLE } from "./user-tables";

describe.skipIf(!TEST_DATABASE_URL)("exportUserData (database)", () => {
  const t = useTestDb();

  async function exported(userId: string) {
    const result = await exportUserData(t.db, { userId });
    if (!result.ok) throw new Error(`export failed with ${result.error.code}`);
    return result.value;
  }

  it("returns the account fields and nothing else about the account (AC-12)", async () => {
    const created = new Date("2026-01-02T03:04:05.000Z");
    const user = await t.fx.newUser({
      name: "Ada",
      emailVerified: true,
      createdAt: created,
    });

    const doc = await exported(user.id);

    expect(doc.schemaVersion).toBe(1);
    expect(doc.account).toEqual({
      id: user.id,
      email: user.email,
      name: "Ada",
      emailVerified: true,
      createdAt: "2026-01-02T03:04:05.000Z",
    });
  });

  it("writes exportedAt as an ISO 8601 UTC string close to now", async () => {
    const user = await t.fx.newUser();
    const doc = await exported(user.id);
    expect(doc.exportedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(Math.abs(Date.now() - Date.parse(doc.exportedAt))).toBeLessThan(
      60_000,
    );
  });

  it("has an empty export for a new user, with no profile", async () => {
    const user = await t.fx.newUser();
    const doc = await exported(user.id);
    expect(doc.profile).toBeNull();
    expect(doc.ratings).toEqual([]);
    expect(doc.skips).toEqual([]);
  });

  it("exports ratings with title, year, stars (score divided by 2) and ISO times (AC-12)", async () => {
    const user = await t.fx.newUser();
    const dated = await t.fx.newMovie({
      title: `Heat ${token()}`,
      releaseDate: "1995-12-15",
    });
    const undated = await t.fx.newMovie({ title: `Undated ${token()}` });
    await saveRating(t.db, {
      userId: user.id,
      movieId: dated.id,
      score: 7,
      source: "manual",
    });
    await saveRating(t.db, {
      userId: user.id,
      movieId: undated.id,
      score: 1,
      source: "import",
    });

    const doc = await exported(user.id);

    const heat = doc.ratings.find((r) => r.movieId === dated.id);
    const other = doc.ratings.find((r) => r.movieId === undated.id);
    expect(heat).toMatchObject({
      title: dated.title,
      year: 1995,
      stars: 3.5,
      source: "manual",
    });
    expect(other).toMatchObject({ year: null, stars: 0.5, source: "import" });
    for (const row of doc.ratings) {
      expect(row.ratedAt).toMatch(/Z$/);
      expect(row.updatedAt).toMatch(/Z$/);
    }
  });

  it("lists ratings newest change first", async () => {
    const user = await t.fx.newUser();
    const [first, second] = await t.fx.newMovies(2);
    await saveRating(t.db, {
      userId: user.id,
      movieId: first.id,
      score: 4,
      source: "manual",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await saveRating(t.db, {
      userId: user.id,
      movieId: second.id,
      score: 4,
      source: "manual",
    });
    const doc = await exported(user.id);
    expect(doc.ratings.map((r) => r.movieId)).toEqual([second.id, first.id]);
  });

  it("exports skips with title and year", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie({
      title: `Skipped ${token()}`,
      releaseDate: "2001-04-20",
    });
    await saveSwipe(t.db, {
      userId: user.id,
      movieId: movie.id,
      choice: "not_seen",
    });

    const doc = await exported(user.id);

    expect(doc.skips).toHaveLength(1);
    expect(doc.skips[0]).toMatchObject({
      movieId: movie.id,
      title: movie.title,
      year: 2001,
    });
    expect(doc.skips[0].skippedAt).toMatch(/Z$/);
  });

  it("exports the profile with country, source and terms (AC-17)", async () => {
    const user = await t.fx.newUser();
    await upsertProfile(t.db, {
      userId: user.id,
      country: "gb",
      countrySource: "user",
      termsVersion: "v1",
    });

    const doc = await exported(user.id);

    expect(doc.profile).toMatchObject({
      country: "GB",
      countrySource: "user",
      termsVersion: "v1",
      onboardedAt: null,
    });
    expect(doc.profile?.termsAcceptedAt).toMatch(/Z$/);
  });

  it("exports feedback with title, year, kind and ISO time, newest first (spec 0011, AC-14)", async () => {
    const user = await t.fx.newUser();
    const [older, newer] = await t.fx.newMovies(2);
    await setFeedback(t.db, {
      userId: user.id,
      movieId: older.id,
      kind: "not_interested",
    });
    await setFeedback(t.db, {
      userId: user.id,
      movieId: newer.id,
      kind: "more_like_this",
    });
    await t.db
      .update(feedFeedback)
      .set({ createdAt: new Date("2026-03-01T10:00:00.000Z") })
      .where(eq(feedFeedback.movieId, older.id));
    await t.db
      .update(feedFeedback)
      .set({ createdAt: new Date("2026-04-01T10:00:00.000Z") })
      .where(eq(feedFeedback.movieId, newer.id));

    const doc = await exported(user.id);

    expect(doc.feedback).toEqual([
      {
        movieId: newer.id,
        title: newer.title,
        year: newer.releaseYear,
        kind: "more_like_this",
        createdAt: "2026-04-01T10:00:00.000Z",
      },
      {
        movieId: older.id,
        title: older.title,
        year: older.releaseYear,
        kind: "not_interested",
        createdAt: "2026-03-01T10:00:00.000Z",
      },
    ]);
  });

  it("exports an empty feedback list for a user who gave none, and never another user's", async () => {
    const [owner, other] = [await t.fx.newUser(), await t.fx.newUser()];
    const [movie] = await t.fx.newMovies(1);
    await setFeedback(t.db, {
      userId: other.id,
      movieId: movie.id,
      kind: "not_interested",
    });

    expect((await exported(owner.id)).feedback).toEqual([]);
  });

  it("carries one key for every table in the export registry (AC-12)", async () => {
    const user = await t.fx.newUser();
    const doc = await exported(user.id);
    for (const key of Object.values(EXPORT_KEY_BY_TABLE)) {
      expect(doc).toHaveProperty(key);
    }
  });

  it("never includes password hashes, session tokens or verification values (AC-12)", async () => {
    const user = await t.fx.newUser();
    const secret = `secret-${token()}`;
    await t.db.insert(account).values({
      id: `acct-${token()}`,
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: `hash-${secret}`,
      accessToken: `access-${secret}`,
      refreshToken: `refresh-${secret}`,
      idToken: `id-${secret}`,
      updatedAt: new Date(),
    });
    await t.db.insert(session).values({
      id: `sess-${token()}`,
      token: `session-token-${secret}`,
      expiresAt: new Date(Date.now() + 3600_000),
      userId: user.id,
      ipAddress: "203.0.113.9",
      userAgent: `agent-${secret}`,
      updatedAt: new Date(),
    });
    await t.fx.newVerification({
      identifier: user.email,
      value: `verification-${secret}`,
    });

    const text = JSON.stringify(await exported(user.id));

    expect(text).not.toContain(secret);
    expect(text).not.toContain("203.0.113.9");
    expect(text.toLowerCase()).not.toContain("password");
    expect(text.toLowerCase()).not.toContain("token");
  });

  it("contains only the asked user's data (AC-14)", async () => {
    const [a, b] = [await t.fx.newUser(), await t.fx.newUser()];
    const [mine, theirs, theirSkip] = await t.fx.newMovies(3);
    await saveRating(t.db, {
      userId: a.id,
      movieId: mine.id,
      score: 6,
      source: "manual",
    });
    await saveRating(t.db, {
      userId: b.id,
      movieId: theirs.id,
      score: 6,
      source: "manual",
    });
    await saveSwipe(t.db, {
      userId: b.id,
      movieId: theirSkip.id,
      choice: "not_seen",
    });
    await upsertProfile(t.db, {
      userId: b.id,
      country: "FR",
      countrySource: "user",
    });

    const doc = await exported(a.id);
    const text = JSON.stringify(doc);

    expect(doc.ratings.map((r) => r.movieId)).toEqual([mine.id]);
    expect(doc.skips).toEqual([]);
    expect(doc.profile).toBeNull();
    expect(text).not.toContain(b.id);
    expect(text).not.toContain(b.email);
    expect(text).not.toContain(theirs.title);
  });

  it("returns user_not_found for an unknown user", async () => {
    const result = await exportUserData(t.db, { userId: UNKNOWN_USER_ID });
    expect(result).toEqual({ ok: false, error: { code: "user_not_found" } });
  });

  it("exports skips even when the table is otherwise untouched by the user's ratings", async () => {
    const user = await t.fx.newUser();
    const movie = await t.fx.newMovie();
    await t.db
      .insert(swipeSkips)
      .values({ userId: user.id, movieId: movie.id });
    const doc = await exported(user.id);
    expect(doc.skips.map((s) => s.movieId)).toEqual([movie.id]);
  });
});

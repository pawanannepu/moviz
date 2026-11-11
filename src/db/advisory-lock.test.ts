import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ratings, swipeSkips } from "@/db/schema";
import { saveRating } from "@/ratings/save-rating";
import { saveSwipe } from "@/ratings/save-swipe";
import { undoSwipe } from "@/ratings/undo-swipe";
import { TEST_DATABASE_URL, token, useTestDb } from "@/test-support/test-db";
import { lockUserImport, lockUserImportShared } from "./advisory-lock";
import type { Db } from "./create-db";

// Spec 0009, AC-9 and AC-17: one key, held shared by every rating write and
// exclusive by an import. These tests hold a lock in an open transaction and
// watch who waits.
//
// Timing cannot prove a wait: a round trip to a remote branch can take longer
// than any short budget, so "still pending" would also be true with no lock at
// all. A wait is proven by `blockedOn`, which sees the queued lock in pg_locks.
// "Did not wait" is proven by settling while the other holder is still open,
// which a blocked acquire never does; its budget only has to beat a slow network.
const SETTLE_MS = 10_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when `promise` settles within `ms`, false if it is still waiting. */
async function settlesWithin(promise: Promise<unknown>, ms: number) {
  return Promise.race([promise.then(() => true), sleep(ms).then(() => false)]);
}

describe.skipIf(!TEST_DATABASE_URL)("import locks (database)", () => {
  const t = useTestDb();

  /**
   * True once some transaction is queued behind that user's import lock. It
   * reads pg_locks for an advisory lock that is not granted and whose key is the
   * user's import key (the bigint key is split into classid, the high 32 bits,
   * and objid, the low 32 bits).
   */
  async function blockedOn(userId: string) {
    const deadline = Date.now() + SETTLE_MS;
    while (Date.now() < deadline) {
      const queued = await t.db.execute(sql`
        select 1 from pg_locks
        where locktype = 'advisory' and not granted
          and ((classid::bigint << 32) | objid::bigint)
            = hashtextextended(${`import:${userId}`}::text, 0)`);
      if (queued.rows.length > 0) return true;
      await sleep(100);
    }
    return false;
  }

  /** Opens a transaction that takes the lock and keeps it until `release()`. */
  async function hold(db: Db, userId: string, mode: "exclusive" | "shared") {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let acquired!: () => void;
    const holding = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const done = db.transaction(async (tx) => {
      await (mode === "exclusive" ? lockUserImport : lockUserImportShared)(
        tx,
        userId,
      );
      acquired();
      await gate;
    });
    await holding;
    return { release, done };
  }

  /** Takes the lock, reports when it got it, then lets go. */
  function acquire(db: Db, userId: string, mode: "exclusive" | "shared") {
    return db.transaction(async (tx) => {
      await (mode === "exclusive" ? lockUserImport : lockUserImportShared)(
        tx,
        userId,
      );
    });
  }

  it("lets two shared holders in at the same time (AC-17)", async () => {
    const userId = `lock-${token()}`;
    const first = await hold(t.db, userId, "shared");
    try {
      expect(
        await settlesWithin(acquire(t.db, userId, "shared"), SETTLE_MS),
      ).toBe(true);
    } finally {
      first.release();
      await first.done;
    }
  });

  it("makes an exclusive holder wait for a shared one, then go ahead (AC-9, AC-17)", async () => {
    const userId = `lock-${token()}`;
    const reader = await hold(t.db, userId, "shared");
    const writer = acquire(t.db, userId, "exclusive");
    expect(await blockedOn(userId)).toBe(true);

    reader.release();
    await reader.done;
    expect(await settlesWithin(writer, SETTLE_MS)).toBe(true);
  });

  it("makes a shared holder wait for an exclusive one, then go ahead (AC-17)", async () => {
    const userId = `lock-${token()}`;
    const importer = await hold(t.db, userId, "exclusive");
    const swipe = acquire(t.db, userId, "shared");
    expect(await blockedOn(userId)).toBe(true);

    importer.release();
    await importer.done;
    expect(await settlesWithin(swipe, SETTLE_MS)).toBe(true);
  });

  it("serializes two exclusive holders of the same user (AC-9)", async () => {
    const userId = `lock-${token()}`;
    const first = await hold(t.db, userId, "exclusive");
    const second = acquire(t.db, userId, "exclusive");
    expect(await blockedOn(userId)).toBe(true);

    first.release();
    await first.done;
    expect(await settlesWithin(second, SETTLE_MS)).toBe(true);
  });

  it("does not hold up another user (AC-12)", async () => {
    const importer = await hold(t.db, `lock-${token()}`, "exclusive");
    try {
      expect(
        await settlesWithin(
          acquire(t.db, `lock-${token()}`, "shared"),
          SETTLE_MS,
        ),
      ).toBe(true);
    } finally {
      importer.release();
      await importer.done;
    }
  });

  describe("every rating write waits for that user's import (AC-17)", () => {
    it("holds back saveRating until the import lock is released", async () => {
      const user = await t.fx.newUser();
      const movie = await t.fx.newMovie();
      const importer = await hold(t.db, user.id, "exclusive");

      const saving = saveRating(t.db, {
        userId: user.id,
        movieId: movie.id,
        score: 6,
        source: "manual",
      });
      expect(await blockedOn(user.id)).toBe(true);
      expect(await t.db.$count(ratings, eq(ratings.userId, user.id))).toBe(0);

      importer.release();
      await importer.done;
      expect((await saving).ok).toBe(true);
      expect(await t.db.$count(ratings, eq(ratings.userId, user.id))).toBe(1);
    });

    it("holds back a not seen swipe until the import lock is released", async () => {
      const user = await t.fx.newUser();
      const movie = await t.fx.newMovie();
      const importer = await hold(t.db, user.id, "exclusive");

      const swiping = saveSwipe(t.db, {
        userId: user.id,
        movieId: movie.id,
        choice: "not_seen",
      });
      expect(await blockedOn(user.id)).toBe(true);

      importer.release();
      await importer.done;
      expect((await swiping).ok).toBe(true);
      expect(
        await t.db.$count(
          swipeSkips,
          and(eq(swipeSkips.userId, user.id), eq(swipeSkips.movieId, movie.id)),
        ),
      ).toBe(1);
    });

    it("holds back undoSwipe until the import lock is released", async () => {
      const user = await t.fx.newUser();
      const movie = await t.fx.newMovie();
      await saveSwipe(t.db, {
        userId: user.id,
        movieId: movie.id,
        choice: "not_seen",
      });
      const importer = await hold(t.db, user.id, "exclusive");

      const undoing = undoSwipe(t.db, {
        userId: user.id,
        movieId: movie.id,
        choice: "not_seen",
      });
      expect(await blockedOn(user.id)).toBe(true);

      importer.release();
      await importer.done;
      expect(await undoing).toEqual({ ok: true, value: { restored: true } });
    });

    it("lets many of one user's swipes run side by side while no import runs", async () => {
      const user = await t.fx.newUser();
      const movies = await t.fx.newMovies(6);
      const results = await Promise.all(
        movies.map((movie) =>
          saveSwipe(t.db, {
            userId: user.id,
            movieId: movie.id,
            choice: "not_seen",
          }),
        ),
      );
      expect(results.every((result) => result.ok)).toBe(true);
      expect(
        await t.db.$count(swipeSkips, eq(swipeSkips.userId, user.id)),
      ).toBe(6);
    });
  });
});

import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/create-db";
import { feedFeedback, movies } from "@/db/schema";
import { loadTaste } from "@/recommend/load-taste";
import { reasonFor } from "@/recommend/reason-for";
import { recommendMovies } from "@/recommend/recommend-movies";
import {
  bandStart,
  near,
  useRecommendFixtures,
  vec,
} from "@/test-support/recommend-fixtures";
import { TEST_DATABASE_URL, useTestDb } from "@/test-support/test-db";
import { deleteAccount } from "@/user-data/delete-account";
import { unavailableMovies } from "@/user-data/exclusions";
import { exportUserData } from "@/user-data/export-user-data";

const h = vi.hoisted(() => ({
  db: null as unknown,
  user: null as null | { id: string },
}));
vi.mock("@/db/client", () => ({
  get db() {
    return h.db;
  },
}));
vi.mock("@/auth/session", () => ({
  getUserForAction: async () =>
    h.user
      ? { ok: true, user: h.user }
      : { ok: false, error: "unauthenticated" },
}));

import { setFeedbackAction } from "./actions";
import { clearFeedback, setFeedback } from "./feedback";

const A = bandStart(4);
const log = (k: string, v: unknown) =>
  console.log(`EVID ${k} ${JSON.stringify(v)}`);

describe.skipIf(!TEST_DATABASE_URL)("verify 0011 (database)", () => {
  const ctx = useTestDb();
  const fx = useRecommendFixtures(() => ctx.db, {
    band: 4,
    privateFrom: A + 8,
  });
  const rowsOf = (userId: string) =>
    ctx.db.select().from(feedFeedback).where(eq(feedFeedback.userId, userId));

  it("AC-4 shared filter hides not_interested on both surfaces, keeps more_like_this", async () => {
    const u = await ctx.fx.newUser();
    const [a, b, c] = await ctx.fx.newMovies(3);
    await setFeedback(ctx.db, {
      userId: u.id,
      movieId: a.id,
      kind: "not_interested",
    });
    await setFeedback(ctx.db, {
      userId: u.id,
      movieId: b.id,
      kind: "more_like_this",
    });
    for (const surface of ["feed", "deck"] as const) {
      const r = await ctx.db
        .select({ id: movies.id })
        .from(movies)
        .where(
          sql`${movies.id} in (${a.id}, ${b.id}, ${c.id}) and ${unavailableMovies(u.id, movies.id, surface)}`,
        )
        .orderBy(movies.id);
      log(`AC4_${surface}`, { visible: r.map((x) => x.id), hidden: a.id });
      expect(r.map((x) => x.id)).toEqual([b.id, c.id].sort((x, y) => x - y));
    }
    await clearFeedback(ctx.db, { userId: u.id, movieId: a.id });
    await clearFeedback(ctx.db, { userId: u.id, movieId: b.id });
  });

  it("AC-12/13 the action: auth, validation, not found, idempotent upsert, created_at rule, clear", async () => {
    h.db = ctx.db;
    const u = await ctx.fx.newUser();
    const [m] = await ctx.fx.newMovies(1);
    h.user = null;
    const unauth = await setFeedbackAction({
      movieId: m.id,
      kind: "not_interested",
    });
    expect(unauth).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await rowsOf(u.id)).toEqual([]);
    h.user = { id: u.id };
    const bad = [
      await setFeedbackAction({ movieId: 0, kind: "not_interested" }),
      await setFeedbackAction({ movieId: "12", kind: null }),
      await setFeedbackAction({ movieId: m.id, kind: "love" }),
      await setFeedbackAction({ movieId: m.id }),
    ];
    expect(bad.every((r) => !r.ok && r.error.code === "invalid_input")).toBe(
      true,
    );
    const nf = await setFeedbackAction({
      movieId: 999999999999,
      kind: "not_interested",
    });
    expect(nf).toEqual({ ok: false, error: { code: "movie_not_found" } });
    const stamp = async () =>
      (await rowsOf(u.id)).map((r) => [r.kind, r.createdAt.toISOString()]);
    expect(
      await setFeedbackAction({ movieId: m.id, kind: "more_like_this" }),
    ).toEqual({ ok: true, value: { kind: "more_like_this" } });
    const s1 = await stamp();
    await new Promise((r) => setTimeout(r, 30));
    await setFeedbackAction({ movieId: m.id, kind: "more_like_this" });
    const s2 = await stamp();
    await new Promise((r) => setTimeout(r, 30));
    await setFeedbackAction({ movieId: m.id, kind: "not_interested" });
    const s3 = await stamp();
    expect(await setFeedbackAction({ movieId: m.id, kind: null })).toEqual({
      ok: true,
      value: { kind: null },
    });
    const s4 = await stamp();
    expect(await setFeedbackAction({ movieId: m.id, kind: null })).toEqual({
      ok: true,
      value: { kind: null },
    });
    log("AC13", {
      unauth: unauth.ok,
      bad: bad.map((r) => !r.ok && r.error.code),
      nf,
      s1,
      s2,
      s3,
      s4,
    });
    expect(s1).toHaveLength(1);
    expect(s2).toEqual(s1);
    expect(s3).toHaveLength(1);
    expect(s3[0][0]).toBe("not_interested");
    expect(s3[0][1]).not.toBe(s1[0][1]);
    expect(s4).toEqual([]);
  });

  it("AC-6/7/8/9/10 feedback anchors", async () => {
    const specs = Array.from({ length: 11 }, (_, i) => ({
      vector: vec([[A + 1 + (i % 6), 1]]),
      releaseDate: "1995-12-15",
    }));
    const asked = await fx.addMovies(specs);
    const [m, close] = await fx.addMovies([
      { vector: vec([[A, 1]]), releaseDate: "1995-12-15" },
      { vector: near(A, 0.95, fx.privateDim()) },
    ]);
    const u = await ctx.fx.newUser();
    try {
      // AC-9: one anchor only, no ratings.
      await setFeedback(ctx.db, {
        userId: u.id,
        movieId: m,
        kind: "more_like_this",
      });
      const rec = await recommendMovies(ctx.db, { userId: u.id, limit: 50 });
      if (!rec.ok) throw new Error(rec.error.code);
      const closePick = rec.value.picks.find((p) => p.movie.id === close);
      const selfPick = rec.value.picks.find((p) => p.movie.id === m);
      const rfClose = await reasonFor(ctx.db, { userId: u.id, movieId: close });
      const rfSelf = await reasonFor(ctx.db, { userId: u.id, movieId: m });
      log("AC9_7_8", {
        strength: rec.value.profile.strength,
        closeReason: closePick?.reason,
        selfPick: selfPick ? selfPick.reason : "absent",
        rfClose,
        rfSelf,
      });
      expect(rec.value.profile.strength).toBe("thin");
      expect(closePick?.reason).toMatchObject({
        kind: "more_like_this",
        anchor: { movieId: m, releaseYear: 1995 },
      });
      if (selfPick)
        expect(selfPick.reason).not.toMatchObject({ anchor: { movieId: m } });
      expect(rfClose).toMatchObject({
        ok: true,
        value: { kind: "more_like_this", anchor: { movieId: m } },
      });
      expect(rfSelf).toEqual({ ok: true, value: { kind: "popular" } });
      // AC-6 cap and order, AC-10 rated excluded.
      await clearFeedback(ctx.db, { userId: u.id, movieId: m });
      for (const [i, id] of asked.entries()) {
        await setFeedback(ctx.db, {
          userId: u.id,
          movieId: id,
          kind: "more_like_this",
        });
        await ctx.db
          .update(feedFeedback)
          .set({ createdAt: new Date(Date.UTC(2026, 0, 1 + i)) })
          .where(
            and(eq(feedFeedback.userId, u.id), eq(feedFeedback.movieId, id)),
          );
      }
      const t1 = await loadTaste(ctx.db, u.id);
      const newestTen = [...asked].reverse().slice(0, 10);
      expect(t1.moreLikeThis.map((a) => a.movieId)).toEqual(newestTen);
      expect(t1.moreLikeThisCount).toBe(11);
      expect(
        t1.moreLikeThis.every(
          (a) => a.weight === 1 && a.source === "more_like_this",
        ),
      ).toBe(true);
      const newest = asked[asked.length - 1];
      await fx.rate(u.id, [{ movieId: newest, score: 4 }]);
      const t2 = await loadTaste(ctx.db, u.id);
      const row = await ctx.db
        .select()
        .from(feedFeedback)
        .where(
          and(eq(feedFeedback.userId, u.id), eq(feedFeedback.movieId, newest)),
        );
      log("AC6_10", {
        t1: t1.moreLikeThis.map((a) => a.movieId),
        count1: t1.moreLikeThisCount,
        t2: t2.moreLikeThis.map((a) => a.movieId),
        count2: t2.moreLikeThisCount,
        ratedRowKept: row.length,
      });
      expect(t2.moreLikeThis.map((a) => a.movieId)).toEqual(
        [...asked].reverse().slice(1, 11),
      );
      expect(t2.moreLikeThisCount).toBe(10);
      expect(row).toHaveLength(1);
    } finally {
      await ctx.db.delete(feedFeedback).where(eq(feedFeedback.userId, u.id));
    }
  });

  it("AC-14 export carries feedback, delete removes it", async () => {
    const u = await ctx.fx.newUser();
    const [a, b] = await ctx.fx.newMovies(2);
    await setFeedback(ctx.db, {
      userId: u.id,
      movieId: a.id,
      kind: "not_interested",
    });
    await setFeedback(ctx.db, {
      userId: u.id,
      movieId: b.id,
      kind: "more_like_this",
    });
    const ex = await exportUserData(ctx.db as Db, { userId: u.id });
    if (!ex.ok) throw new Error("export");
    log(
      "AC14_export",
      ex.value.feedback.map((f) => ({ ...f, title: "<t>" })),
    );
    expect(ex.value.feedback).toHaveLength(2);
    expect(Object.keys(ex.value.feedback[0]).sort()).toEqual([
      "createdAt",
      "kind",
      "movieId",
      "title",
      "year",
    ]);
    expect((await deleteAccount(ctx.db, { userId: u.id })).ok).toBe(true);
    const left = await rowsOf(u.id);
    log("AC14_delete", { rowsLeft: left.length });
    expect(left).toEqual([]);
  });
});

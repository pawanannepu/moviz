import { describe, expect, it } from "vitest";
import { err, ok } from "@/lib/result";
import { emptyRunSummary } from "./run-summary";
import type { SyncError } from "./sync-movie";
import { tallySyncResult } from "./tally";

describe("tallySyncResult (AC-15)", () => {
  it("counts a new movie as stored", () => {
    const out = tallySyncResult(
      emptyRunSummary(),
      ok({ kind: "stored", movieId: 1, created: true }),
    );

    expect(out.summary.stored).toBe(1);
    expect(out.summary.updated).toBe(0);
    expect(out).toMatchObject({ abort: null, counted: true });
  });

  it("counts a rewritten movie as updated", () => {
    const out = tallySyncResult(
      emptyRunSummary(),
      ok({ kind: "stored", movieId: 1, created: false }),
    );

    expect(out.summary.updated).toBe(1);
    expect(out.summary.stored).toBe(0);
    expect(out.counted).toBe(true);
  });

  it("counts an eligibility skip under its reason without counting the movie", () => {
    const out = tallySyncResult(
      emptyRunSummary(),
      ok({ kind: "skipped", reason: "low_votes" }),
    );

    expect(out.summary.skipped.low_votes).toBe(1);
    expect(out).toMatchObject({ abort: null, counted: false });
  });

  it("counts a TMDB not found, a wrong shape and an empty title as skips", () => {
    const run = (error: SyncError) =>
      tallySyncResult(emptyRunSummary(), err(error)).summary.skipped;

    expect(run({ code: "tmdb_not_found" }).not_found).toBe(1);
    expect(run({ code: "tmdb_bad_shape" }).bad_shape).toBe(1);
    expect(run({ code: "empty_title" }).empty_title).toBe(1);
  });

  it("counts a refused or unreachable TMDB as failed and keeps going", () => {
    const rejected = tallySyncResult(
      emptyRunSummary(),
      err({ code: "tmdb_rejected", status: 422 }),
    );
    const unavailable = tallySyncResult(
      emptyRunSummary(),
      err({ code: "tmdb_unavailable", status: 503 }),
    );

    expect(rejected.summary.failed).toBe(1);
    expect(unavailable.summary.failed).toBe(1);
    expect(rejected.abort).toBeNull();
    expect(unavailable.abort).toBeNull();
  });

  it("stops the run on a bad token and does not count it as a failed movie", () => {
    const out = tallySyncResult(
      emptyRunSummary(),
      err({ code: "tmdb_unauthorized" }),
    );

    expect(out.abort).toBe("tmdb_unauthorized");
    expect(out.summary.failed).toBe(0);
  });

  it("stops the run when the database is lost", () => {
    const out = tallySyncResult(
      emptyRunSummary(),
      err({ code: "db_unavailable" }),
    );

    expect(out.abort).toBe("db_unavailable");
  });

  it("does not change the summary it was given", () => {
    const before = emptyRunSummary();
    tallySyncResult(before, ok({ kind: "stored", movieId: 1, created: true }));

    expect(before).toEqual(emptyRunSummary());
  });
});

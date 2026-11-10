import { describe, expect, it } from "vitest";
import {
  near,
  useRecommendFixtures,
  vec,
} from "@/test-support/recommend-fixtures";
import { TEST_DATABASE_URL, useTestDb } from "@/test-support/test-db";
import type { TasteAnchor } from "./load-taste";
import { ratingWeight } from "./rules";
import { scoreCandidates } from "./score-candidates";

/** Anchors sit on dimensions of this file's own band (0), so a test controls every similarity. */
const A = 128;
const B = 129;

const anchorOf = (movieId: number, score: number): TasteAnchor => ({
  movieId,
  title: "anchor",
  releaseYear: null,
  score,
  weight: ratingWeight(score),
});

/** The popularity nudge from AC-10, written out the long way. */
const prior = (voteAverage: number | null, voteCount: number | null) => {
  const average = Math.min(1, Math.max(0, (voteAverage ?? 0) / 10));
  const votes = Math.min(
    1,
    Math.log(1 + (voteCount ?? 0)) / Math.log(1 + 5000),
  );
  return average * votes;
};

describe.skipIf(!TEST_DATABASE_URL)("scoreCandidates", () => {
  const ctx = useTestDb();
  const fx = useRecommendFixtures(() => ctx.db, { band: 0 });

  /** The movies the current test made. Other test files add movies at the same time. */
  let mine = new Set<number>();
  const scoreMine = async (input: Parameters<typeof scoreCandidates>[1]) =>
    (await scoreCandidates(ctx.db, input)).filter((row) =>
      mine.has(row.movieId),
    );

  /** A user who rated the anchors. */
  async function setup(
    anchors: { vector: number[]; score: number }[],
    candidates: Parameters<typeof fx.addMovies>[0],
  ) {
    const user = await ctx.fx.newUser();
    const anchorIds = await fx.addMovies(
      anchors.map((a) => ({ vector: a.vector })),
    );
    const candidateIds = await fx.addMovies(candidates);
    await fx.rate(
      user.id,
      anchorIds.map((movieId, i) => ({ movieId, score: anchors[i].score })),
    );
    mine = new Set([...anchorIds, ...candidateIds]);
    return {
      userId: user.id,
      anchors: anchorIds.map((id, i) => anchorOf(id, anchors[i].score)),
      candidateIds,
    };
  }

  const score = (rows: { movieId: number; score: number }[], id: number) =>
    rows.find((row) => row.movieId === id)?.score;

  it("AC-3: scores a candidate as weight times cosine similarity to a liked anchor", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 9 }],
      [{ vector: vec([[A, 1]]) }, { vector: near(A, 0.7, 130) }],
    );
    const [close, mid] = candidateIds;

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [],
    });

    expect(score(rows, close)).toBeCloseTo(ratingWeight(9) * 1, 5);
    expect(score(rows, mid)).toBeCloseTo(ratingWeight(9) * 0.7, 5);
  });

  it("AC-3: ranks a candidate closer to a liked anchor above one further away", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 9 }],
      [
        { vector: near(A, 0.5, 131) },
        { vector: near(A, 0.9, 132) },
        { vector: near(A, 0.7, 133) },
      ],
    );
    const [far, closest, middle] = candidateIds;

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [],
    });

    expect(rows.map((row) => row.movieId)).toEqual([closest, middle, far]);
  });

  it("AC-3 AC-6: scores by the best liked anchor and names that anchor", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [
        { vector: vec([[A, 1]]), score: 10 },
        { vector: vec([[B, 1]]), score: 6 },
      ],
      // Close to B (weak like, weight 0.11) and a little to A (strong like).
      [
        {
          vector: vec([
            [A, 0.3],
            [B, 0.9],
            [134, Math.sqrt(1 - 0.09 - 0.81)],
          ]),
        },
      ],
    );
    const [candidate] = candidateIds;

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [],
    });

    // 1.0 * 0.3 from A beats 0.111 * 0.9 from B, so A is the reason.
    expect(rows[0].movieId).toBe(candidate);
    expect(rows[0].anchorId).toBe(anchors[0].movieId);
    expect(rows[0].score).toBeCloseTo(0.3, 5);
  });

  it("AC-6: breaks a tie between two liked anchors in favour of the lower movie id", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [
        { vector: vec([[A, 1]]), score: 10 },
        { vector: vec([[B, 1]]), score: 10 },
      ],
      [
        {
          vector: vec([
            [A, 0.6],
            [B, 0.6],
            [135, Math.sqrt(1 - 0.72)],
          ]),
        },
      ],
    );

    const rows = await scoreMine({
      userId,
      // Reversed, so the lower id wins by rule and not by list order.
      liked: [...anchors].reverse(),
      disliked: [],
      shown: [],
    });

    expect(rows[0].movieId).toBe(candidateIds[0]);
    expect(rows[0].anchorId).toBe(Math.min(...anchors.map((a) => a.movieId)));
  });

  it("AC-3: lowers a candidate that is close to a disliked anchor by half of its pull", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [
        { vector: vec([[A, 1]]), score: 9 },
        { vector: vec([[B, 1]]), score: 2 },
      ],
      [
        // Same closeness to the liked anchor; only the second is near the disliked one.
        { vector: near(A, 0.7, 136) },
        {
          vector: vec([
            [A, 0.7],
            [B, 0.5],
            [137, Math.sqrt(1 - 0.49 - 0.25)],
          ]),
        },
      ],
    );
    const [neutral, nearDisliked] = candidateIds;

    const rows = await scoreMine({
      userId,
      liked: [anchors[0]],
      disliked: [anchors[1]],
      shown: [],
    });

    const pos = ratingWeight(9) * 0.7;
    expect(score(rows, neutral)).toBeCloseTo(pos, 5);
    expect(score(rows, nearDisliked)).toBeCloseTo(
      pos - 0.5 * Math.abs(ratingWeight(2)) * 0.5,
      5,
    );
    expect(rows.map((row) => row.movieId)).toEqual([neutral, nearDisliked]);
  });

  it("AC-3: penalises by the closest disliked anchor (the maximum), not by their sum", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [
        { vector: vec([[A, 1]]), score: 10 }, // weight +1
        { vector: vec([[159, 1]]), score: 1 }, // weight -1
        { vector: vec([[160, 1]]), score: 5 }, // weight about -0.111
      ],
      [
        // 0.8 to the liked anchor, 0.3 to the first disliked and 0.5 to the second.
        {
          vector: vec([
            [A, 0.8],
            [159, 0.3],
            [160, 0.5],
            [161, Math.sqrt(1 - 0.64 - 0.09 - 0.25)],
          ]),
        },
      ],
    );

    const rows = await scoreMine({
      userId,
      liked: [anchors[0]],
      disliked: [anchors[1], anchors[2]],
      shown: [],
    });

    // Pull from the first disliked anchor is 1 * 0.3 = 0.3, from the second
    // 0.111 * 0.5 = 0.056. The maximum is 0.3, where a sum would be 0.356 and an
    // average 0.178. The score is 0.8 - 0.5 * 0.3.
    expect(score(rows, candidateIds[0])).toBeCloseTo(0.8 - 0.5 * 0.3, 5);
  });

  it("AC-3: never gives a bonus for a negative cosine to a disliked anchor", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [
        { vector: vec([[A, 1]]), score: 9 },
        { vector: vec([[B, 1]]), score: 1 },
      ],
      [
        { vector: near(A, 0.7, 138) },
        {
          vector: vec([
            [A, 0.7],
            [B, -0.5],
            [139, Math.sqrt(1 - 0.49 - 0.25)],
          ]),
        },
      ],
    );
    const [neutral, opposite] = candidateIds;

    const rows = await scoreMine({
      userId,
      liked: [anchors[0]],
      disliked: [anchors[1]],
      shown: [],
    });

    expect(score(rows, opposite)).toBeCloseTo(score(rows, neutral) ?? NaN, 6);
  });

  it("AC-3: scores with no penalty when there is no disliked anchor", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 9 }],
      [
        {
          vector: vec([
            [A, 0.7],
            [B, 0.5],
            [140, Math.sqrt(1 - 0.49 - 0.25)],
          ]),
        },
      ],
    );

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [],
    });

    expect(score(rows, candidateIds[0])).toBeCloseTo(ratingWeight(9) * 0.7, 5);
  });

  it("AC-10: adds the popularity nudge from the vote average and vote count", async () => {
    const specs = [
      { voteAverage: 10, voteCount: 5000 },
      { voteAverage: 8, voteCount: 1000 },
      { voteAverage: 10, voteCount: 0 },
      { voteAverage: 0, voteCount: 5000 },
      { voteAverage: -3, voteCount: 5000 },
    ];
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 10 }],
      specs.map((spec) => ({ vector: vec([[A, 1]]), ...spec })),
    );

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [],
    });

    specs.forEach((spec, i) => {
      expect(score(rows, candidateIds[i])).toBeCloseTo(
        1 + 0.1 * prior(spec.voteAverage, spec.voteCount),
        5,
      );
    });
  });

  it("AC-10: adds at most 0.1, however many votes and however high the average", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 10 }],
      [
        { vector: vec([[A, 1]]), voteAverage: 10, voteCount: 50_000_000 },
        { vector: vec([[A, 1]]), voteAverage: 99, voteCount: 5000 },
      ],
    );

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [],
    });

    for (const id of candidateIds) {
      expect(score(rows, id)).toBeCloseTo(1.1, 5);
    }
  });

  it("AC-10: counts a missing vote average or vote count as 0 and still gives a number", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 10 }],
      [
        { vector: vec([[A, 1]]), voteAverage: null, voteCount: null },
        { vector: vec([[A, 1]]), voteAverage: 9, voteCount: null },
        { vector: vec([[A, 1]]), voteAverage: null, voteCount: 5000 },
      ],
    );

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [],
    });

    expect(rows).toHaveLength(3);
    for (const id of candidateIds) {
      const value = score(rows, id);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeCloseTo(1, 5);
    }
  });

  it("AC-10: lets a better voted candidate win a taste gap smaller than 0.1", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 10 }],
      [
        { vector: near(A, 0.95, 141) },
        { vector: near(A, 0.9, 142), voteAverage: 10, voteCount: 5000 },
      ],
    );
    const [closer, betterVoted] = candidateIds;

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [],
    });

    expect(rows.map((row) => row.movieId)).toEqual([betterVoted, closer]);
  });

  it("AC-10: never lets votes reverse a taste gap larger than 0.1", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 10 }],
      [
        { vector: near(A, 0.95, 143) },
        { vector: near(A, 0.8, 144), voteAverage: 10, voteCount: 5000 },
      ],
    );
    const [closer, betterVoted] = candidateIds;

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [],
    });

    expect(rows.map((row) => row.movieId)).toEqual([closer, betterVoted]);
  });

  it("AC-1: orders by score from highest to lowest, then by movie id", async () => {
    const twin = near(A, 0.6, 145);
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 9 }],
      [
        { vector: twin },
        { vector: vec([[A, 1]]) },
        { vector: twin },
        { vector: near(A, 0.3, 146) },
      ],
    );
    const [twinOne, best, twinTwo, worst] = candidateIds;

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [],
    });

    expect(rows.map((row) => row.movieId)).toEqual([
      best,
      Math.min(twinOne, twinTwo),
      Math.max(twinOne, twinTwo),
      worst,
    ]);
  });

  it("AC-2 AC-12 AC-13: leaves out rated, skipped, unlisted, shown and unembedded movies", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 9 }],
      [
        { vector: near(A, 0.8, 147) }, // control: should be returned
        { vector: near(A, 0.8, 148) }, // rated by the user
        { vector: near(A, 0.8, 149) }, // skipped by the user
        { vector: near(A, 0.8, 150), poster: false }, // no poster
        { vector: near(A, 0.8, 151), removed: true }, // withdrawn by the catalog
        { vector: near(A, 0.8, 152) }, // already shown
        { vector: null }, // no embedding at all
        { vector: near(A, 0.8, 153), model: "test-other-model" }, // another model
      ],
    );
    const [
      control,
      rated,
      skipped,
      noPoster,
      removed,
      shown,
      plain,
      otherModel,
    ] = candidateIds;
    await fx.rate(userId, [{ movieId: rated, score: 3 }]);
    await fx.skip(userId, skipped);

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [shown],
    });

    // Another test file's embed sweep may have given the last two a vector of
    // its own since they were made; if so they are fair candidates.
    const swept = await fx.embeddedNow([plain, otherModel]);
    const ids = rows
      .map((row) => row.movieId)
      .filter((id) => !swept.includes(id));
    expect(ids).toEqual([control]);
    for (const hidden of [rated, skipped, noPoster, removed, shown]) {
      expect(ids).not.toContain(hidden);
    }
  });

  it("AC-2: never returns a liked anchor as a candidate", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 9 }],
      [{ vector: near(A, 0.6, 154) }],
    );

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [],
    });

    expect(rows.map((row) => row.movieId)).toEqual(candidateIds);
  });

  it("AC-12: accepts a long list of shown ids in one query", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 9 }],
      [{ vector: near(A, 0.6, 155) }, { vector: near(A, 0.5, 156) }],
    );
    const shown = Array.from({ length: 500 }, (_, i) => i + 1);

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [...shown, candidateIds[0]],
    });

    expect(rows.map((row) => row.movieId)).toEqual([candidateIds[1]]);
  });

  it("returns nothing when there is no liked anchor", async () => {
    const { userId, anchors } = await setup(
      [{ vector: vec([[B, 1]]), score: 2 }],
      [{ vector: near(B, 0.9, 157) }],
    );

    const rows = await scoreMine({
      userId,
      liked: [],
      disliked: anchors,
      shown: [],
    });

    expect(rows).toEqual([]);
  });

  it("returns nothing when no listable movie has an embedding yet", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 9 }],
      [{ vector: null }, { vector: null, poster: false }],
    );

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [],
    });

    // The first has a poster, so another file's embed sweep may have embedded it.
    const swept = await fx.embeddedNow(candidateIds);
    expect(
      rows.map((row) => row.movieId).filter((id) => !swept.includes(id)),
    ).toEqual([]);
  });

  it("AC-16: shows each user their own exclusions", async () => {
    const { userId, anchors, candidateIds } = await setup(
      [{ vector: vec([[A, 1]]), score: 9 }],
      [{ vector: near(A, 0.6, 158) }],
    );
    const other = await ctx.fx.newUser();
    await fx.rate(other.id, [{ movieId: candidateIds[0], score: 4 }]);

    const rows = await scoreMine({
      userId,
      liked: anchors,
      disliked: [],
      shown: [],
    });

    expect(rows.map((row) => row.movieId)).toEqual(candidateIds);
  });
});

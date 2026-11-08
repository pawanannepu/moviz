import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { mapDetails } from "@/catalog/sync/map-details";
import { persistMovie } from "@/catalog/sync/persist-movie";
import { movieEmbeddings, movies } from "@/db/schema";
import {
  details,
  fakeVoyage,
  personIdsOf,
  removeCatalogRows,
} from "@/test-support/catalog-fixtures";
import { TEST_DATABASE_URL, token, useTestDb } from "@/test-support/test-db";
import { embedMovies } from "./embed-movies";
import { buildEmbeddingText, hashEmbeddingText } from "./embedding-text";
import {
  EMBED_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "./model";

describe.skipIf(!TEST_DATABASE_URL)("embedMovies", () => {
  const ctx = useTestDb();
  const tmdbIds: number[] = [];
  const personIds: number[] = [];

  async function store(
    tag: string,
    overrides: Parameters<typeof details>[1] = {},
  ) {
    const movie = details(tag, overrides);
    tmdbIds.push(movie.id);
    personIds.push(...personIdsOf(movie));
    const stored = await persistMovie(ctx.db, mapDetails(movie));
    if (!stored.ok) throw new Error("fixture movie was not stored");
    return { id: stored.value.movieId, movie };
  }

  const embeddingOf = async (movieId: number) => {
    const rows = await ctx.db
      .select()
      .from(movieEmbeddings)
      .where(eq(movieEmbeddings.movieId, movieId));
    return rows[0];
  };

  /** How many texts sent to Voyage mention this tag. */
  const sentCount = (batches: string[][], tag: string) =>
    batches.flat().filter((text) => text.includes(tag)).length;

  afterAll(async () => {
    await removeCatalogRows(ctx.db, tmdbIds, personIds);
  });

  it("writes one 1024 dimension vector per listable movie with the text hash (AC-8)", async () => {
    const tag = token();
    const { id } = await store(tag);
    const voyage = fakeVoyage();

    const result = await embedMovies({ db: ctx.db, voyage: voyage.client });

    expect(result.ok).toBe(true);
    const saved = await embeddingOf(id);
    expect(saved).toMatchObject({
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    const expectedText = buildEmbeddingText({
      title: `Movie ${tag}`,
      releaseYear: 2001,
      genres: ["Action", "Drama"],
      tagline: `A tagline for ${tag}`,
      overview: `An overview for ${tag}.`,
      directors: [`Director ${tag}`],
      cast: [`Actor ${tag}`],
    });
    expect(saved.textHash).toBe(hashEmbeddingText(expectedText));
    expect(sentCount(voyage.batches, tag)).toBe(1);
    expect(voyage.batches.flat().find((t) => t.includes(tag))).toBe(
      expectedText,
    );
  });

  it("skips a movie whose model and hash have not changed, so a second run does not send it (AC-8)", async () => {
    const tag = token();
    await store(tag);
    await embedMovies({ db: ctx.db, voyage: fakeVoyage().client });
    const voyage = fakeVoyage();

    const result = await embedMovies({ db: ctx.db, voyage: voyage.client });

    expect(result.ok).toBe(true);
    expect(sentCount(voyage.batches, tag)).toBe(0);
  });

  it("embeds only the movie whose text changed (AC-8, AC-9)", async () => {
    const changedTag = token();
    const sameTag = token();
    const changed = await store(changedTag);
    const same = await store(sameTag);
    await embedMovies({ db: ctx.db, voyage: fakeVoyage().client });
    const oldHash = (await embeddingOf(changed.id)).textHash;
    const sameHash = (await embeddingOf(same.id)).textHash;
    await ctx.db
      .update(movies)
      .set({ overview: "A completely different overview." })
      .where(eq(movies.id, changed.id));
    const voyage = fakeVoyage();

    await embedMovies({ db: ctx.db, voyage: voyage.client });

    expect(sentCount(voyage.batches, changedTag)).toBe(1);
    expect(sentCount(voyage.batches, sameTag)).toBe(0);
    expect((await embeddingOf(changed.id)).textHash).not.toBe(oldHash);
    expect((await embeddingOf(same.id)).textHash).toBe(sameHash);
  });

  it("never embeds a movie with no poster or a removed movie (AC-8, AC-19)", async () => {
    const posterTag = token();
    const goneTag = token();
    const noPoster = await store(posterTag, { poster_path: null });
    const gone = await store(goneTag);
    await ctx.db
      .update(movies)
      .set({ sourceMissingAt: new Date() })
      .where(eq(movies.id, gone.id));
    const voyage = fakeVoyage();

    await embedMovies({ db: ctx.db, voyage: voyage.client });

    expect(sentCount(voyage.batches, posterTag)).toBe(0);
    expect(sentCount(voyage.batches, goneTag)).toBe(0);
    expect(await embeddingOf(noPoster.id)).toBeUndefined();
    expect(await embeddingOf(gone.id)).toBeUndefined();
  });

  it("fails only the movie whose vector has the wrong size (AC-15)", async () => {
    const badTag = token();
    const goodTag = token();
    const bad = await store(badTag);
    const good = await store(goodTag);
    const voyage = fakeVoyage({ wrongSizeFor: badTag });

    const result = await embedMovies({ db: ctx.db, voyage: voyage.client });

    expect(result.ok && result.value.failed).toBeGreaterThanOrEqual(1);
    expect(await embeddingOf(bad.id)).toBeUndefined();
    expect(await embeddingOf(good.id)).toBeDefined();
  });

  it("writes no vector for a movie that stopped being listable while Voyage worked (AC-19)", async () => {
    const tag = token();
    const { id } = await store(tag);
    const voyage = fakeVoyage({
      onBatch: async (texts) => {
        if (texts.some((text) => text.includes(tag))) {
          await ctx.db
            .update(movies)
            .set({ posterPath: null })
            .where(eq(movies.id, id));
        }
      },
    });

    await embedMovies({ db: ctx.db, voyage: voyage.client });

    expect(sentCount(voyage.batches, tag)).toBe(1);
    expect(await embeddingOf(id)).toBeUndefined();
  });

  it("embeds at most the limit it is given", async () => {
    await store(token());
    await store(token());
    const voyage = fakeVoyage();

    const result = await embedMovies(
      { db: ctx.db, voyage: voyage.client },
      { limit: 1 },
    );

    expect(result.ok && result.value.embedded).toBeLessThanOrEqual(1);
    expect(voyage.batches.flat().length).toBeLessThanOrEqual(1);
  });

  it("starts no batch after the deadline", async () => {
    await store(token());
    const voyage = fakeVoyage();

    const result = await embedMovies({
      db: ctx.db,
      voyage: voyage.client,
      deadline: 1000,
      now: () => 2000,
    });

    expect(result).toEqual({ ok: true, value: { embedded: 0, failed: 0 } });
    expect(voyage.batches).toEqual([]);
  });

  it("keeps the batches already saved when Voyage fails, and reports the error and progress (AC-8)", async () => {
    // More listable movies than one batch holds, so there are two batches.
    const rows = await ctx.fx.newMovies(EMBED_BATCH_SIZE + 1);
    const ids = rows.map((row) => row.id);
    await ctx.db
      .update(movies)
      .set({ posterPath: "/batch-test.jpg" })
      .where(inArray(movies.id, ids));
    const voyage = fakeVoyage({
      failOnCall: { call: 2, code: "voyage_unavailable" },
    });

    const result = await embedMovies({ db: ctx.db, voyage: voyage.client });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("voyage_unavailable");
    expect(result.error.progress.embedded).toBeGreaterThan(0);
    expect(voyage.batches[0]).toHaveLength(EMBED_BATCH_SIZE);
    const saved = await ctx.db.select().from(movieEmbeddings);
    expect(saved.length).toBeGreaterThanOrEqual(result.error.progress.embedded);
  });

  it("returns the Voyage error without any key in it (AC-16)", async () => {
    await store(token());
    const voyage = fakeVoyage({
      failOnCall: { call: 1, code: "voyage_unavailable" },
    });

    const result = await embedMovies({ db: ctx.db, voyage: voyage.client });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/key|token|bearer/i);
  });
});

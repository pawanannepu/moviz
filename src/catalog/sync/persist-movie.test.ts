import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  credits,
  genres,
  movieEmbeddings,
  movieExternalIds,
  movieGenres,
  movies,
  movieTitles,
  people,
} from "@/db/schema";
import {
  details,
  newPersonId,
  personIdsOf,
  removeCatalogRows,
} from "@/test-support/catalog-fixtures";
import {
  TEST_DATABASE_URL,
  token,
  unitVector,
  useTestDb,
  vectorLiteral,
} from "@/test-support/test-db";
import { mapDetails } from "./map-details";
import { persistMovie } from "./persist-movie";

describe.skipIf(!TEST_DATABASE_URL)("persistMovie", () => {
  const ctx = useTestDb();
  const tmdbIds: number[] = [];
  const personIds: number[] = [];

  const track = (movie: ReturnType<typeof details>) => {
    tmdbIds.push(movie.id);
    personIds.push(...personIdsOf(movie));
    return movie;
  };

  async function row(movieId: number) {
    const [found] = await ctx.db
      .select()
      .from(movies)
      .where(eq(movies.id, movieId));
    return found;
  }

  afterAll(async () => {
    await removeCatalogRows(ctx.db, tmdbIds, personIds);
  });

  it("writes the movie, its tmdb id, titles, genres and credits (AC-2, AC-3)", async () => {
    const tag = token();
    const movie = track(
      details(tag, {
        original_title: `Original ${tag}`,
        alternative_titles: { titles: [{ title: `Alt ${tag}` }] },
      }),
    );

    const stored = await persistMovie(ctx.db, mapDetails(movie));

    expect(stored.ok && stored.value.created).toBe(true);
    if (!stored.ok) return;
    const id = stored.value.movieId;
    const saved = await row(id);
    expect(saved).toMatchObject({
      title: `Movie ${tag}`,
      overview: `An overview for ${tag}.`,
      voteCount: 1000,
      sourceMissingAt: null,
    });
    expect(saved.fetchedAt).not.toBeNull();

    const ext = await ctx.db
      .select()
      .from(movieExternalIds)
      .where(eq(movieExternalIds.movieId, id));
    expect(ext).toEqual([
      { provider: "tmdb", externalId: String(movie.id), movieId: id },
    ]);

    const titles = await ctx.db
      .select()
      .from(movieTitles)
      .where(eq(movieTitles.movieId, id));
    expect(titles.filter((t) => t.kind === "primary")).toHaveLength(1);
    expect(titles.map((t) => t.kind).sort()).toEqual([
      "alternate",
      "original",
      "primary",
    ]);

    const linked = await ctx.db
      .select({ name: genres.name })
      .from(movieGenres)
      .innerJoin(genres, eq(genres.id, movieGenres.genreId))
      .where(eq(movieGenres.movieId, id));
    expect(linked.map((g) => g.name).sort()).toEqual(["Action", "Drama"]);

    const credited = await ctx.db
      .select({ role: credits.role })
      .from(credits)
      .where(eq(credits.movieId, id));
    expect(credited.map((c) => c.role).sort()).toEqual(["cast", "director"]);
  });

  it("rewrites an existing movie in place, replacing its children and moving updated_at (AC-2, AC-19)", async () => {
    const tag = token();
    const movie = track(details(tag));
    const first = await persistMovie(ctx.db, mapDetails(movie));
    if (!first.ok) throw new Error("first write failed");
    const id = first.value.movieId;
    const before = await row(id);

    const changed = track({
      ...movie,
      overview: "A new overview.",
      genres: [{ id: 35, name: "Comedy" }],
      alternative_titles: { titles: [{ title: `Fresh alt ${tag}` }] },
      credits: {
        cast: [
          {
            id: newPersonId(),
            name: `New actor ${tag}`,
            character: "Other",
            order: 0,
            profile_path: null,
          },
        ],
        crew: [],
      },
    });
    const second = await persistMovie(ctx.db, mapDetails(changed));

    expect(second).toEqual({
      ok: true,
      value: { movieId: id, created: false },
    });
    const after = await row(id);
    expect(after.overview).toBe("A new overview.");
    expect(after.updatedAt.getTime()).toBeGreaterThan(
      before.updatedAt.getTime(),
    );
    expect(after.fetchedAt?.getTime()).toBeGreaterThan(
      before.fetchedAt?.getTime() ?? 0,
    );

    const linked = await ctx.db
      .select({ name: genres.name })
      .from(movieGenres)
      .innerJoin(genres, eq(genres.id, movieGenres.genreId))
      .where(eq(movieGenres.movieId, id));
    expect(linked.map((g) => g.name)).toEqual(["Comedy"]);

    const titles = await ctx.db
      .select({ key: movieTitles.titleNormalized })
      .from(movieTitles)
      .where(eq(movieTitles.movieId, id));
    expect(titles.some((t) => t.key.startsWith("fresh alt"))).toBe(true);

    const credited = await ctx.db
      .select({ role: credits.role })
      .from(credits)
      .where(eq(credits.movieId, id));
    expect(credited).toEqual([{ role: "cast" }]);
    // Still one row for this TMDB id.
    const ext = await ctx.db
      .select()
      .from(movieExternalIds)
      .where(eq(movieExternalIds.externalId, String(movie.id)));
    expect(ext).toHaveLength(1);
  });

  it("brings a removed movie back by clearing source_missing_at (AC-2)", async () => {
    const movie = track(details(token()));
    const first = await persistMovie(ctx.db, mapDetails(movie));
    if (!first.ok) throw new Error("first write failed");
    await ctx.db
      .update(movies)
      .set({ sourceMissingAt: new Date() })
      .where(eq(movies.id, first.value.movieId));

    await persistMovie(ctx.db, mapDetails(movie));

    expect((await row(first.value.movieId)).sourceMissingAt).toBeNull();
  });

  it("deletes the embeddings of a movie whose poster is now null (AC-19)", async () => {
    const movie = track(details(token()));
    const first = await persistMovie(ctx.db, mapDetails(movie));
    if (!first.ok) throw new Error("first write failed");
    const id = first.value.movieId;
    await ctx.pool.query(
      `insert into movie_embeddings (movie_id, model, dimensions, embedding, text_hash)
       values ($1, 'voyage-4', 1024, $2::vector, 'hash')`,
      [id, vectorLiteral(unitVector(0))],
    );

    await persistMovie(ctx.db, mapDetails({ ...movie, poster_path: "" }));

    const left = await ctx.db
      .select()
      .from(movieEmbeddings)
      .where(eq(movieEmbeddings.movieId, id));
    expect(left).toEqual([]);
    expect((await row(id)).posterPath).toBeNull();
  });

  it("keeps the embeddings of a movie that still has a poster (AC-19)", async () => {
    const movie = track(details(token()));
    const first = await persistMovie(ctx.db, mapDetails(movie));
    if (!first.ok) throw new Error("first write failed");
    const id = first.value.movieId;
    await ctx.pool.query(
      `insert into movie_embeddings (movie_id, model, dimensions, embedding, text_hash)
       values ($1, 'voyage-4', 1024, $2::vector, 'hash')`,
      [id, vectorLiteral(unitVector(0))],
    );

    await persistMovie(ctx.db, mapDetails(movie));

    const left = await ctx.db
      .select()
      .from(movieEmbeddings)
      .where(eq(movieEmbeddings.movieId, id));
    expect(left).toHaveLength(1);
  });

  it("creates a genre TMDB adds later, by name, and keeps existing genre ids (AC-19)", async () => {
    const tag = token();
    const newGenre = `Genre ${tag}`;
    const movie = track(details(tag, { genres: [{ id: 18, name: "Drama" }] }));
    await persistMovie(ctx.db, mapDetails(movie));
    const [drama] = await ctx.db
      .select()
      .from(genres)
      .where(eq(genres.name, "Drama"));

    await persistMovie(
      ctx.db,
      mapDetails({
        ...movie,
        genres: [
          { id: 18, name: "Drama" },
          { id: 999, name: newGenre },
        ],
      }),
    );

    const [dramaAfter] = await ctx.db
      .select()
      .from(genres)
      .where(eq(genres.name, "Drama"));
    const created = await ctx.db
      .select()
      .from(genres)
      .where(eq(genres.name, newGenre));
    expect(dramaAfter.id).toBe(drama.id);
    expect(created).toHaveLength(1);
    await ctx.db
      .delete(movieGenres)
      .where(eq(movieGenres.genreId, created[0].id));
    await ctx.db.delete(genres).where(eq(genres.id, created[0].id));
  });

  it("stores one person row per TMDB person across movies (AC-18)", async () => {
    const personId = newPersonId();
    const cast = [
      {
        id: personId,
        name: "Shared Actor",
        character: "A",
        order: 0,
        profile_path: null,
      },
    ];
    const one = track(details(token(), { credits: { cast, crew: [] } }));
    const two = track(details(token(), { credits: { cast, crew: [] } }));

    await persistMovie(ctx.db, mapDetails(one));
    await persistMovie(ctx.db, mapDetails(two));

    const rows = await ctx.db
      .select()
      .from(people)
      .where(eq(people.tmdbId, personId));
    expect(rows).toHaveLength(1);
    const links = await ctx.db
      .select()
      .from(credits)
      .where(eq(credits.personId, rows[0].id));
    expect(links).toHaveLength(2);
  });

  it("merges a person listed twice into one credit with joined character names (AC-18)", async () => {
    const personId = newPersonId();
    const movie = track(
      details(token(), {
        credits: {
          cast: [
            {
              id: personId,
              name: "Twice",
              character: "First",
              order: 4,
              profile_path: null,
            },
            {
              id: personId,
              name: "Twice",
              character: "Second",
              order: 1,
              profile_path: null,
            },
          ],
          crew: [],
        },
      }),
    );

    const stored = await persistMovie(ctx.db, mapDetails(movie));
    if (!stored.ok) throw new Error("write failed");

    const rows = await ctx.db
      .select()
      .from(credits)
      .where(eq(credits.movieId, stored.value.movieId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      billingOrder: 1,
      characterName: "Second / First",
    });
  });

  it("ends with one movie and consistent children when the same movie is written at once (AC-18)", async () => {
    const tag = token();
    const movie = track(
      details(tag, { genres: [{ id: 1, name: `G ${tag}` }] }),
    );
    const mapped = mapDetails(movie);

    const results = await Promise.all(
      Array.from({ length: 6 }, () => persistMovie(ctx.db, mapped)),
    );

    expect(results.every((r) => r.ok)).toBe(true);
    const ext = await ctx.db
      .select()
      .from(movieExternalIds)
      .where(eq(movieExternalIds.externalId, String(movie.id)));
    expect(ext).toHaveLength(1);
    const id = ext[0].movieId;
    expect(results.filter((r) => r.ok && r.value.created)).toHaveLength(1);
    const titles = await ctx.db
      .select()
      .from(movieTitles)
      .where(and(eq(movieTitles.movieId, id), eq(movieTitles.kind, "primary")));
    expect(titles).toHaveLength(1);
    const credited = await ctx.db
      .select()
      .from(credits)
      .where(eq(credits.movieId, id));
    expect(credited).toHaveLength(2);
    const created = await ctx.db
      .select()
      .from(genres)
      .where(inArray(genres.name, [`G ${tag}`]));
    expect(created).toHaveLength(1);
    await ctx.db
      .delete(movieGenres)
      .where(eq(movieGenres.genreId, created[0].id));
    await ctx.db.delete(genres).where(eq(genres.id, created[0].id));
  });

  it("refuses a movie with no usable title and writes nothing (AC-3)", async () => {
    const movie = details(token(), { title: "", original_title: "!!!" });
    tmdbIds.push(movie.id);

    const result = await persistMovie(ctx.db, mapDetails(movie));

    expect(result).toEqual({ ok: false, error: { code: "empty_title" } });
    const ext = await ctx.db
      .select()
      .from(movieExternalIds)
      .where(eq(movieExternalIds.externalId, String(movie.id)));
    expect(ext).toEqual([]);
  });

  it("writes every child row or none: a failure midway leaves nothing behind (AC-2)", async () => {
    const movie = track(details(token()));
    const mapped = mapDetails(movie);
    // Two title rows with the same key break the title primary key midway.
    const broken = {
      ...mapped,
      titles: [
        { titleNormalized: "dup", kind: "primary" as const },
        { titleNormalized: "dup", kind: "alternate" as const },
      ],
    };

    await expect(persistMovie(ctx.db, broken)).rejects.toThrow();

    const ext = await ctx.db
      .select()
      .from(movieExternalIds)
      .where(eq(movieExternalIds.externalId, String(movie.id)));
    expect(ext).toEqual([]);
  });
});

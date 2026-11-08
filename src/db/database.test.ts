import { and, cosineDistance, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { normalizeTitle } from "@/catalog/normalize-title";
import {
  movieEmbeddings,
  movies,
  movieTitles,
  profiles,
  ratings,
} from "@/db/schema";
import { saveRating } from "@/ratings/save-rating";
import { saveSwipe } from "@/ratings/save-swipe";
import {
  pgError,
  TEST_DATABASE_URL,
  token,
  unitVector,
  useTestDb,
  vectorLiteral,
} from "@/test-support/test-db";
import { unavailableMovies } from "@/user-data/exclusions";

const MODEL = "test-model";

describe.skipIf(!TEST_DATABASE_URL)("the migrated schema (database)", () => {
  const t = useTestDb();

  const embed = (
    movieId: number,
    vector: number[],
    model = MODEL,
    dimensions = 1024,
  ) =>
    t.db.insert(movieEmbeddings).values({
      movieId,
      model,
      dimensions,
      embedding: vector,
      textHash: "hash",
    });

  describe("migration 1 (AC-1, AC-15)", () => {
    it("created all 16 tables", async () => {
      const result = await t.db.execute(
        sql`select table_name from information_schema.tables where table_schema = 'public'`,
      );
      const names = result.rows.map(
        (row) => (row as { table_name: string }).table_name,
      );
      expect(names).toEqual(
        expect.arrayContaining([
          "user",
          "session",
          "account",
          "verification",
          "rate_limit",
          "profiles",
          "movies",
          "movie_titles",
          "movie_external_ids",
          "genres",
          "movie_genres",
          "people",
          "credits",
          "movie_embeddings",
          "ratings",
          "swipe_skips",
        ]),
      );
    });

    it("enabled the vector extension", async () => {
      const result = await t.db.execute(
        sql`select extname from pg_extension where extname = 'vector'`,
      );
      expect(result.rows).toHaveLength(1);
    });

    it("has a GIN index on movies.search and an HNSW index on the embeddings", async () => {
      const result = await t.db.execute(sql`
        select indexname, indexdef from pg_indexes
        where schemaname = 'public' and tablename in ('movies', 'movie_embeddings')
      `);
      const defs = result.rows.map((r) =>
        (r as { indexdef: string }).indexdef.toLowerCase(),
      );
      expect(
        defs.some((d) => d.includes("using gin") && d.includes("(search)")),
      ).toBe(true);
      expect(
        defs.some(
          (d) => d.includes("using hnsw") && d.includes("vector_cosine_ops"),
        ),
      ).toBe(true);
    });
  });

  describe("rating checks (AC-2)", () => {
    it.each([0, 11, -3])(
      "the database rejects a rating score of %s",
      async (score) => {
        const user = await t.fx.newUser();
        const movie = await t.fx.newMovie();
        const error = await pgError(() =>
          t.db.insert(ratings).values({
            userId: user.id,
            movieId: movie.id,
            score,
            source: "manual",
          }),
        );
        expect(error?.code).toBe("23514");
      },
    );

    it("the database rejects a second rating row for the same user and movie", async () => {
      const user = await t.fx.newUser();
      const movie = await t.fx.newMovie();
      await t.db.insert(ratings).values({
        userId: user.id,
        movieId: movie.id,
        score: 5,
        source: "manual",
      });
      const error = await pgError(() =>
        t.db.insert(ratings).values({
          userId: user.id,
          movieId: movie.id,
          score: 6,
          source: "manual",
        }),
      );
      expect(error?.code).toBe("23505");
    });

    it("refuses to delete a movie that someone has rated", async () => {
      const user = await t.fx.newUser();
      const movie = await t.fx.newMovie();
      await t.db.insert(ratings).values({
        userId: user.id,
        movieId: movie.id,
        score: 5,
        source: "manual",
      });
      const error = await pgError(() =>
        t.db.delete(movies).where(eq(movies.id, movie.id)),
      );
      // 23001 is restrict_violation, what ON DELETE RESTRICT raises.
      expect(error?.code).toBe("23001");
    });
  });

  describe("profile checks (AC-17)", () => {
    it("rejects a lower case country", async () => {
      const user = await t.fx.newUser();
      const error = await pgError(() =>
        t.db
          .insert(profiles)
          .values({ userId: user.id, country: "gb", countrySource: "user" }),
      );
      expect(error?.code).toBe("23514");
    });

    it("rejects a country with no source, and a source with no country", async () => {
      const [a, b] = [await t.fx.newUser(), await t.fx.newUser()];
      const noSource = await pgError(() =>
        t.db.insert(profiles).values({ userId: a.id, country: "GB" }),
      );
      const noCountry = await pgError(() =>
        t.db.insert(profiles).values({ userId: b.id, countrySource: "ip" }),
      );
      expect(noSource?.code).toBe("23514");
      expect(noCountry?.code).toBe("23514");
    });
  });

  describe("embeddings (AC-7)", () => {
    it("rejects a vector of the wrong size", async () => {
      const movie = await t.fx.newMovie();
      const error = await pgError(() => embed(movie.id, [1, 2, 3]));
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/dimensions/);
    });

    it("rejects dimensions = 512 even with a vector of the right size", async () => {
      const movie = await t.fx.newMovie();
      const error = await pgError(() =>
        embed(movie.id, unitVector(0), MODEL, 512),
      );
      expect(error?.code).toBe("23514");
    });

    it("keeps one embedding per movie and model, but allows a second model", async () => {
      const movie = await t.fx.newMovie();
      await embed(movie.id, unitVector(0));
      const duplicate = await pgError(() => embed(movie.id, unitVector(1)));
      const otherModel = await pgError(() =>
        embed(movie.id, unitVector(1), "other-model"),
      );
      expect(duplicate?.code).toBe("23505");
      expect(otherModel).toBeNull();
    });

    it("finds the nearest movie by cosine distance, and skips rated and skipped ones for a user", async () => {
      const user = await t.fx.newUser();
      const [near, middle, far] = await t.fx.newMovies(3);
      const query = unitVector(0);
      const slightlyOff = unitVector(0).map((v, i) => (i === 1 ? 0.5 : v));
      await embed(near.id, query);
      await embed(middle.id, slightlyOff);
      await embed(far.id, unitVector(2));
      const ids = [near.id, middle.id, far.id];

      const nearest = (exclude: boolean) =>
        t.db
          .select({ id: movieEmbeddings.movieId })
          .from(movieEmbeddings)
          .where(
            and(
              inArray(movieEmbeddings.movieId, ids),
              eq(movieEmbeddings.model, MODEL),
              exclude
                ? unavailableMovies(user.id, movieEmbeddings.movieId, "feed")
                : sql`true`,
            ),
          )
          .orderBy(cosineDistance(movieEmbeddings.embedding, query));

      expect((await nearest(false)).map((r) => r.id)).toEqual([
        near.id,
        middle.id,
        far.id,
      ]);

      await saveRating(t.db, {
        userId: user.id,
        movieId: near.id,
        score: 9,
        source: "manual",
      });
      await saveSwipe(t.db, {
        userId: user.id,
        movieId: middle.id,
        choice: "not_seen",
      });

      expect((await nearest(true)).map((r) => r.id)).toEqual([far.id]);
    });

    it("can use the HNSW index when a table scan is switched off", async () => {
      const movie = await t.fx.newMovie();
      await embed(movie.id, unitVector(3));
      const literal = vectorLiteral(unitVector(3));

      const plan = await t.db.transaction(async (tx) => {
        await tx.execute(sql`set local enable_seqscan = off`);
        const result = await tx.execute(
          sql.raw(
            `explain select movie_id from movie_embeddings order by embedding <=> '${literal}'::vector limit 1`,
          ),
        );
        return result.rows
          .map((row) => String(Object.values(row)[0]))
          .join("\n");
      });

      expect(plan).toContain("movie_embeddings_embedding_hnsw_idx");
    });
  });

  describe("full text search (AC-8)", () => {
    const rank = (ids: number[], query: string) =>
      t.db.execute(sql`
        select id from movies
        where id in (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})
          and search @@ websearch_to_tsquery('english', ${query})
        order by ts_rank(search, websearch_to_tsquery('english', ${query})) desc, id
      `);

    it("ranks a title match above a movie whose overview only mentions the word", async () => {
      const titled = await t.fx.newMovie({
        title: "Heat",
        overview: "A crew of thieves in Los Angeles.",
      });
      const overviewOnly = await t.fx.newMovie({
        title: `Summer Days ${token()}`,
        overview: "A long heat wave hits the town.",
      });
      const result = await rank([overviewOnly.id, titled.id], "heat");
      expect(result.rows.map((r) => Number((r as { id: string }).id))).toEqual([
        titled.id,
        overviewOnly.id,
      ]);
    });

    it("finds a movie with no overview by its title", async () => {
      const bare = await t.fx.newMovie({ title: "Nosferatu", overview: null });
      const result = await rank([bare.id], "nosferatu");
      expect(result.rows).toHaveLength(1);
    });

    it("stems words, so a plural query finds a singular title", async () => {
      const movie = await t.fx.newMovie({ title: "The Birds", overview: null });
      const result = await rank([movie.id], "bird");
      expect(result.rows).toHaveLength(1);
    });

    it("does not match a movie that has neither the word in title nor overview", async () => {
      const movie = await t.fx.newMovie({
        title: `Quiet ${token()}`,
        overview: "Snow falls.",
      });
      const result = await rank([movie.id], "heat");
      expect(result.rows).toEqual([]);
    });
  });

  describe("title lookup (AC-9)", () => {
    async function lookup(title: string, year: number) {
      const result = await t.db.execute(sql`
        select distinct m.id
        from movie_titles mt
        join movies m on m.id = mt.movie_id
        where mt.title_normalized = ${normalizeTitle(title)} and m.release_year = ${year}
      `);
      return result.rows.map((row) => Number((row as { id: string }).id));
    }

    it("finds the same movie for AMELIE and amélie with the right year", async () => {
      const unique = token();
      const movie = await t.fx.newMovie({
        title: `Amélie ${unique}`,
        releaseDate: "2001-04-25",
      });
      expect(await lookup(`AMELIE ${unique}`, 2001)).toEqual([movie.id]);
      expect(await lookup(`amélie ${unique}`, 2001)).toEqual([movie.id]);
    });

    it("finds a movie through an alternate title", async () => {
      const unique = token();
      const movie = await t.fx.newMovie({
        title: `Le Fabuleux ${unique}`,
        releaseDate: "2001-04-25",
      });
      await t.db.insert(movieTitles).values({
        movieId: movie.id,
        titleNormalized: normalizeTitle(`Amelie From Montmartre ${unique}`),
        kind: "alternate",
      });
      expect(await lookup(`Amélie from Montmartre ${unique}`, 2001)).toEqual([
        movie.id,
      ]);
    });

    it("finds nothing when the year is wrong", async () => {
      const unique = token();
      await t.fx.newMovie({
        title: `Amélie ${unique}`,
        releaseDate: "2001-04-25",
      });
      expect(await lookup(`Amélie ${unique}`, 2002)).toEqual([]);
    });

    it("derives release_year from release_date", async () => {
      const movie = await t.fx.newMovie({ releaseDate: "1995-12-15" });
      const [row] = await t.db
        .select({ year: movies.releaseYear })
        .from(movies)
        .where(eq(movies.id, movie.id));
      expect(row.year).toBe(1995);
    });
  });
});

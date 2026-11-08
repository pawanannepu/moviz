import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";
import { afterAll, beforeAll, vi } from "vitest";
import { normalizeTitle } from "@/catalog/normalize-title";
import { createDb, type Db } from "@/db/create-db";
import {
  EMBEDDING_DIMENSIONS,
  movies,
  movieTitles,
  user,
  verification,
} from "@/db/schema";

/**
 * Shared support for the database tests. Only test files import this.
 *
 * The database tests run against the Neon test branch (`DATABASE_URL_TEST`),
 * never dev or production. They skip when it is not set. They never wipe
 * anything: every test creates its own users and movies with random ids and
 * removes them afterwards, so test files can run side by side.
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  // No local env file (for example in CI). The real environment is used.
}

const hostOf = (url: string) =>
  new URL(url).hostname.replace(/-pooler(?=\.)/, "");

function resolveTestDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) return null;
  const testHost = hostOf(url);
  for (const name of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
    const other = process.env[name];
    if (other && hostOf(other) === testHost) {
      throw new Error(
        `DATABASE_URL_TEST points at the same database host as ${name}. Refusing to run tests against it.`,
      );
    }
  }
  return url;
}

/** The test branch connection string, or null when database tests should skip. */
export const TEST_DATABASE_URL = resolveTestDatabaseUrl();

const MIGRATION_LOCK_KEY = 727_272_001;

/** Applies the Drizzle migrations once at a time, even when test files start together. */
async function migrateTestDb(pool: Pool, db: Db): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../../drizzle", import.meta.url),
      ),
    });
  } finally {
    await client
      .query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
}

/** A short random token that is safe inside titles and ids. */
export const token = () => randomUUID().replace(/-/g, "").slice(0, 12);

/** A movie id that cannot exist in the test branch. */
export const UNKNOWN_MOVIE_ID = 4_503_599_627_370_000;

export const UNKNOWN_USER_ID = "user-that-does-not-exist";

/** A `Db` that fails the test if anything touches it. For code that must return before any query. */
export const forbiddenDb = new Proxy(
  {},
  {
    get() {
      throw new Error("The database was used, but this call must not use it");
    },
  },
) as unknown as Db;

/** A vector of the embedding size with a 1 at one position. Two of them are orthogonal. */
export function unitVector(position: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  vector[position] = 1;
  return vector;
}

/** The text form pgvector reads. */
export const vectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;

/**
 * Runs a statement that should fail inside Postgres and returns the SQLSTATE and
 * message of the driver error. Returns null when the statement succeeded.
 * Rethrows anything that is not a Postgres error, so a bug does not look like a rejection.
 */
export async function pgError(
  run: () => Promise<unknown>,
): Promise<{ code: string; message: string } | null> {
  try {
    await run();
    return null;
  } catch (error) {
    let current: unknown = error;
    for (
      let depth = 0;
      depth < 5 && typeof current === "object" && current;
      depth++
    ) {
      const candidate = current as { code?: unknown; message?: unknown };
      if (typeof candidate.code === "string") {
        return {
          code: candidate.code,
          message:
            typeof candidate.message === "string" ? candidate.message : "",
        };
      }
      current = (current as { cause?: unknown }).cause;
    }
    throw error;
  }
}

/** Creates users and movies for one test file and removes them again. */
export function createFixtures(db: Db) {
  const userIds: string[] = [];
  const movieIds: number[] = [];
  const verificationIds: string[] = [];

  async function newUser(overrides: Partial<typeof user.$inferInsert> = {}) {
    const id = overrides.id ?? `test-user-${token()}`;
    const [row] = await db
      .insert(user)
      .values({
        id,
        name: "Test User",
        email: `${id}@example.test`,
        ...overrides,
      })
      .returning();
    userIds.push(id);
    return row;
  }

  async function newMovie(
    input: {
      title?: string;
      overview?: string | null;
      releaseDate?: string | null;
    } = {},
  ) {
    const title = input.title ?? `Test Movie ${token()}`;
    const [row] = await db
      .insert(movies)
      .values({
        title,
        titleNormalized: normalizeTitle(title),
        overview: input.overview ?? null,
        releaseDate: input.releaseDate ?? null,
      })
      .returning();
    movieIds.push(row.id);
    await db.insert(movieTitles).values({
      movieId: row.id,
      titleNormalized: row.titleNormalized,
      kind: "primary",
    });
    return row;
  }

  async function newMovies(count: number) {
    const values = Array.from({ length: count }, () => {
      const title = `Test Movie ${token()}`;
      return { title, titleNormalized: normalizeTitle(title) };
    });
    const rows = await db.insert(movies).values(values).returning();
    for (const row of rows) movieIds.push(row.id);
    await db.insert(movieTitles).values(
      rows.map((row) => ({
        movieId: row.id,
        titleNormalized: row.titleNormalized,
        kind: "primary" as const,
      })),
    );
    return rows;
  }

  async function newVerification(input: { identifier: string; value: string }) {
    const id = `test-verification-${token()}`;
    await db.insert(verification).values({
      id,
      identifier: input.identifier,
      value: input.value,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    verificationIds.push(id);
    return id;
  }

  async function cleanup() {
    if (verificationIds.length > 0) {
      await db
        .delete(verification)
        .where(inArray(verification.id, verificationIds));
    }
    // Users first: ratings and skips point at movies with `restrict`.
    if (userIds.length > 0) {
      await db.delete(user).where(inArray(user.id, userIds));
    }
    if (movieIds.length > 0) {
      await db.delete(movies).where(inArray(movies.id, movieIds));
    }
  }

  return { newUser, newMovie, newMovies, newVerification, cleanup };
}

export type Fixtures = ReturnType<typeof createFixtures>;

/**
 * Call inside `describe.skipIf(!TEST_DATABASE_URL)(...)`. Opens the test branch,
 * applies the migrations, and removes this file's fixtures afterwards.
 */
export function useTestDb() {
  const ctx = {} as { db: Db; pool: Pool; fx: Fixtures };
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) throw new Error("DATABASE_URL_TEST is not set");
    const { pool, db } = createDb(TEST_DATABASE_URL, { max: 8 });
    await migrateTestDb(pool, db);
    ctx.pool = pool;
    ctx.db = db;
    ctx.fx = createFixtures(db);
  });

  afterAll(async () => {
    if (!ctx.pool) return;
    try {
      await ctx.fx.cleanup();
    } finally {
      await ctx.pool.end();
    }
  });

  return ctx;
}

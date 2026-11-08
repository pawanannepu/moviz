/**
 * `pnpm catalog:seed [--target <n>] [--id <tmdbId>]` (spec 0003).
 *
 * Loads the movie catalog from TMDB into the database named by
 * `DATABASE_URL_UNPOOLED`. Run it from your machine against a Neon branch you
 * chose. Safe to run again. Prints a run summary: counts and TMDB ids only,
 * never a token.
 *
 * This script parses only the names it needs and does not import `src/env.ts`.
 */
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_TARGET,
  forceSyncMovie,
  seedCatalog,
} from "@/catalog/sync/seed-catalog";
import { createTmdbClient } from "@/catalog/tmdb/client";
import { createDb } from "@/db/create-db";

const envSchema = z.object({
  DATABASE_URL_UNPOOLED: z.url(),
  TMDB_API_TOKEN: z.string().min(1),
});

const argsSchema = z.object({
  target: z.coerce.number().int().min(1).max(10_000).default(DEFAULT_TARGET),
  id: z.coerce.number().int().positive().optional(),
});

async function main(): Promise<number> {
  const env = envSchema.safeParse(process.env);
  if (!env.success) {
    // Names only, never values.
    const names = [...new Set(env.error.issues.map((i) => String(i.path[0])))];
    console.error(
      `Missing or invalid environment variables: ${names.join(", ")}`,
    );
    return 1;
  }

  const { values } = parseArgs({
    options: {
      target: { type: "string" },
      id: { type: "string" },
    },
  });
  const args = argsSchema.safeParse(values);
  if (!args.success) {
    console.error(
      "Usage: pnpm catalog:seed [--target <n, 1 to 10000>] [--id <tmdbId>]",
    );
    return 1;
  }

  const { pool, db } = createDb(env.data.DATABASE_URL_UNPOOLED, {
    max: DEFAULT_CONCURRENCY + 1,
  });
  const tmdb = createTmdbClient({ token: env.data.TMDB_API_TOKEN });
  const deps = { db, tmdb, today: new Date().toISOString().slice(0, 10) };

  try {
    if (args.data.id !== undefined) {
      const result = await forceSyncMovie(deps, args.data.id);
      if (!result.ok) {
        console.error(`Stopped: ${result.error.code}`);
        console.error(JSON.stringify(result.error.summary, null, 2));
        return 1;
      }
      const { outcome } = result.value;
      console.log(
        outcome.kind === "skipped"
          ? `Movie ${args.data.id} not stored: ${outcome.reason}. Any stored row was left alone.`
          : `Movie ${args.data.id}: ${outcome.kind}.`,
      );
      console.log(JSON.stringify(result.value.summary, null, 2));
      return 0;
    }

    const result = await seedCatalog(deps, {
      target: args.data.target,
      onProgress: ({ page, counted, target }) =>
        console.log(`discover page ${page}: ${counted} of ${target} movies`),
    });
    if (!result.ok) {
      console.error(`Stopped: ${result.error.code}. Run again to continue.`);
      console.error(JSON.stringify(result.error.summary, null, 2));
      return 1;
    }
    if (result.value.shortfall > 0) {
      console.log(
        `TMDB ran out of movies that pass the rules: ${result.value.shortfall} short of ${args.data.target}.`,
      );
    }
    console.log(JSON.stringify(result.value, null, 2));
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // Print the error name only: a message could carry connection details.
    console.error(
      `Unexpected failure: ${error instanceof Error ? error.name : "unknown"}`,
    );
    process.exitCode = 1;
  },
);

/**
 * `pnpm embed:catalog` (spec 0003).
 *
 * Writes one Voyage vector for every listable movie that has no current one, in
 * the database named by `DATABASE_URL_UNPOOLED`. Safe to run again: movies whose
 * model and text hash have not changed are skipped, so a second run makes no
 * Voyage calls. Prints counts only, never a key.
 *
 * This script parses only the names it needs and does not import `src/env.ts`.
 */
import { z } from "zod";
import { embedMovies } from "@/catalog/embedding/embed-movies";
import { createVoyageClient } from "@/catalog/embedding/voyage-client";
import { createDb } from "@/db/create-db";

const envSchema = z.object({
  DATABASE_URL_UNPOOLED: z.url(),
  VOYAGE_API_KEY: z.string().min(1),
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

  const { pool, db } = createDb(env.data.DATABASE_URL_UNPOOLED, { max: 2 });
  try {
    const voyage = createVoyageClient({ apiKey: env.data.VOYAGE_API_KEY });
    const result = await embedMovies({ db, voyage });
    if (!result.ok) {
      const { progress, ...error } = result.error;
      console.error(
        `Stopped: ${error.code}. Batches already saved stay saved.`,
      );
      console.error(JSON.stringify(progress));
      return 1;
    }
    console.log(JSON.stringify(result.value));
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

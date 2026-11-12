/**
 * `pnpm watch:regions` (spec 0013).
 *
 * Asks TMDB for the countries it has watch data for and compares them with the
 * checked in `WATCH_REGIONS` in `src/watch/regions.ts`. Prints the codes to add
 * and to remove, and the full sorted list to paste in. Changes no file. Prints
 * codes only, never the token.
 *
 * This script parses only the names it needs and does not import `src/env.ts`.
 */
import { z } from "zod";
import { createTmdbClient } from "@/catalog/tmdb/client";
import { WATCH_REGIONS } from "@/watch/regions";

const envSchema = z.object({ TMDB_API_TOKEN: z.string().min(1) });

const regionsSchema = z.object({
  results: z.array(z.object({ iso_3166_1: z.string() })),
});

async function main(): Promise<number> {
  const env = envSchema.safeParse(process.env);
  if (!env.success) {
    console.error("Missing or invalid environment variables: TMDB_API_TOKEN");
    return 1;
  }
  const tmdb = createTmdbClient({ token: env.data.TMDB_API_TOKEN });
  const result = await tmdb.get("/watch/providers/regions", {}, regionsSchema);
  if (!result.ok) {
    console.error(`TMDB call failed: ${result.error.code}`);
    return 1;
  }
  const live = [
    ...new Set(
      result.value.results
        .map((region) => region.iso_3166_1.trim().toUpperCase())
        .filter((code) => /^[A-Z]{2}$/.test(code)),
    ),
  ].sort();
  const known = new Set<string>(WATCH_REGIONS);
  const liveSet = new Set(live);
  const add = live.filter((code) => !known.has(code));
  const remove = WATCH_REGIONS.filter((code) => !liveSet.has(code));

  console.log(`TMDB lists ${live.length} countries.`);
  console.log(`To add: ${add.length === 0 ? "none" : add.join(" ")}`);
  console.log(`To remove: ${remove.length === 0 ? "none" : remove.join(" ")}`);
  if (add.length > 0 || remove.length > 0) {
    console.log("\nThe full list for WATCH_REGIONS:");
    console.log(live.map((code) => `"${code}"`).join(", "));
  }
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(
      `Unexpected failure: ${error instanceof Error ? error.name : "unknown"}`,
    );
    process.exitCode = 1;
  },
);

import { EMBEDDING_DIMENSIONS } from "@/db/schema";

/**
 * The Voyage model that writes every catalog vector (spec 0003, AC-8). It is
 * from the `voyage-4` family, which returns 1024 dimension vectors by default
 * and accepts `output_dimension` (checked against Voyage's docs at build).
 * Changing it makes every stored vector stale: `embed:catalog` then re embeds
 * the whole catalog, because rows are keyed by (movie, model).
 */
export const EMBEDDING_MODEL = "voyage-4";

/** Vector size, fixed by spec 0002 and the `movie_embeddings` check constraint. */
export { EMBEDDING_DIMENSIONS };

/** Movies per Voyage call and per database write. */
export const EMBED_BATCH_SIZE = 100;

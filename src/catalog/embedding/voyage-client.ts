import { z } from "zod";
import {
  type HttpFailure,
  type HttpRuntime,
  requestJson,
} from "@/catalog/http/request-json";
import { err, ok, type Result } from "@/lib/result";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./model";

/**
 * Thin Voyage AI client (spec 0003, AC-15, AC-16). The answer is parsed with
 * Zod; expected failures are returned as a typed `VoyageError`. The key goes only
 * into the `Authorization` header, never into a URL, an error, or a log line.
 */

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
export const VOYAGE_TIMEOUT_MS = 20_000;

const embeddingsResponseSchema = z.object({
  data: z.array(
    z.object({ index: z.number().int(), embedding: z.array(z.number()) }),
  ),
});

export type VoyageError =
  /** 401 or 403: the key is wrong. */
  | { code: "voyage_unauthorized" }
  | { code: "voyage_bad_shape" }
  | { code: "voyage_rejected"; status: number }
  | { code: "voyage_unavailable"; status: number | null };

export type VoyageClientOptions = HttpRuntime & {
  apiKey: string;
  endpoint?: string;
};

export type VoyageClient = {
  /**
   * Embeds texts as `document` input at 1024 dimensions. Returns one vector per
   * text, in input order. A vector whose length is not 1024 comes back as `null`
   * so the caller can fail that one movie.
   */
  embedDocuments(
    texts: string[],
    options?: { deadline?: number },
  ): Promise<Result<(number[] | null)[], VoyageError>>;
  /**
   * Embeds one search phrase as `query` input at 1024 dimensions (spec 0012,
   * AC-7), in one try with no retry. `timeoutMs` limits that try (default
   * `VOYAGE_TIMEOUT_MS`). A vector whose length is not 1024 comes back as
   * `null`. The text goes only into the request body, never into an error.
   */
  embedQuery(
    text: string,
    options?: { timeoutMs?: number },
  ): Promise<Result<number[] | null, VoyageError>>;
};

function toVoyageError(failure: HttpFailure): VoyageError {
  switch (failure.code) {
    case "unauthorized":
      return { code: "voyage_unauthorized" };
    case "bad_shape":
      return { code: "voyage_bad_shape" };
    case "not_found":
      return { code: "voyage_rejected", status: 404 };
    case "rejected":
      return { code: "voyage_rejected", status: failure.status };
    case "unavailable":
      return { code: "voyage_unavailable", status: failure.status };
  }
}

/** Builds a Voyage client. Nothing is fetched until a method is called. */
export function createVoyageClient(options: VoyageClientOptions): VoyageClient {
  const headers = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  return {
    async embedQuery(text, requestOptions = {}) {
      const result = await requestJson(
        {
          url: new URL(options.endpoint ?? ENDPOINT),
          method: "POST",
          headers,
          body: JSON.stringify({
            input: [text],
            model: EMBEDDING_MODEL,
            input_type: "query",
            output_dimension: EMBEDDING_DIMENSIONS,
          }),
          schema: embeddingsResponseSchema,
          timeoutMs: requestOptions.timeoutMs ?? VOYAGE_TIMEOUT_MS,
          maxAttempts: 1,
        },
        options,
      );
      if (!result.ok) return err(toVoyageError(result.error));
      const [item, ...rest] = result.value.data;
      if (!item || rest.length > 0 || item.index !== 0) {
        return err({ code: "voyage_bad_shape" });
      }
      return ok(
        item.embedding.length === EMBEDDING_DIMENSIONS ? item.embedding : null,
      );
    },

    async embedDocuments(texts, requestOptions = {}) {
      const result = await requestJson(
        {
          url: new URL(options.endpoint ?? ENDPOINT),
          method: "POST",
          headers,
          body: JSON.stringify({
            input: texts,
            model: EMBEDDING_MODEL,
            input_type: "document",
            output_dimension: EMBEDDING_DIMENSIONS,
          }),
          schema: embeddingsResponseSchema,
          timeoutMs: VOYAGE_TIMEOUT_MS,
          deadline: requestOptions.deadline,
        },
        options,
      );
      if (!result.ok) return err(toVoyageError(result.error));

      // One vector per input, matched by `index`. Anything else is a wrong shape.
      const vectors: (number[] | null)[] = new Array(texts.length).fill(null);
      const seen = new Set<number>();
      for (const item of result.value.data) {
        if (
          item.index < 0 ||
          item.index >= texts.length ||
          seen.has(item.index)
        ) {
          return err({ code: "voyage_bad_shape" });
        }
        seen.add(item.index);
        vectors[item.index] =
          item.embedding.length === EMBEDDING_DIMENSIONS
            ? item.embedding
            : null;
      }
      if (seen.size !== texts.length) return err({ code: "voyage_bad_shape" });
      return ok(vectors);
    },
  };
}

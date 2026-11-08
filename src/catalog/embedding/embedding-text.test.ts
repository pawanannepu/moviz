import { describe, expect, it } from "vitest";
import {
  buildEmbeddingText,
  EMBEDDING_CAST_COUNT,
  type EmbeddingInput,
  hashEmbeddingText,
} from "./embedding-text";

const full: EmbeddingInput = {
  title: "Heat",
  releaseYear: 1995,
  genres: ["Drama", "Action", "Crime"],
  tagline: "A Los Angeles crime saga",
  overview: "A thief and a detective.",
  directors: ["Michael Mann"],
  cast: ["Al Pacino", "Robert De Niro", "Val Kilmer"],
};

describe("buildEmbeddingText (AC-9)", () => {
  it("builds the documented recipe line by line", () => {
    expect(buildEmbeddingText(full)).toBe(
      [
        "Heat (1995)",
        "Genres: Action, Crime, Drama",
        "Tagline: A Los Angeles crime saga",
        "A thief and a detective.",
        "Directed by: Michael Mann",
        "Starring: Al Pacino, Robert De Niro, Val Kilmer",
      ].join("\n"),
    );
  });

  it("has no trailing newline", () => {
    expect(buildEmbeddingText(full).endsWith("\n")).toBe(false);
  });

  it("leaves out lines whose data is missing", () => {
    const text = buildEmbeddingText({
      title: "Bare",
      releaseYear: null,
      genres: [],
      tagline: "  ",
      overview: null,
      directors: [],
      cast: [],
    });

    expect(text).toBe("Bare");
  });

  it("uses the title alone when there is no release year", () => {
    expect(
      buildEmbeddingText({ ...full, releaseYear: null }).split("\n")[0],
    ).toBe("Heat");
  });

  it("uses only the first five cast names", () => {
    const cast = Array.from({ length: 8 }, (_, i) => `Actor ${i}`);
    const line = buildEmbeddingText({ ...full, cast })
      .split("\n")
      .find((l) => l.startsWith("Starring:"));

    expect(line?.split(", ")).toHaveLength(EMBEDDING_CAST_COUNT);
    expect(line).toContain("Actor 4");
    expect(line).not.toContain("Actor 5");
  });

  it("keeps the order of directors and cast", () => {
    const text = buildEmbeddingText({
      ...full,
      directors: ["B Director", "A Director"],
      cast: ["Z Actor", "A Actor"],
    });

    expect(text).toContain("Directed by: B Director, A Director");
    expect(text).toContain("Starring: Z Actor, A Actor");
  });

  it("gives the same text whatever order the genres arrive in", () => {
    const a = buildEmbeddingText({ ...full, genres: ["Drama", "Action"] });
    const b = buildEmbeddingText({ ...full, genres: ["Action", "Drama"] });

    expect(a).toBe(b);
  });

  it("does not change the genre array it was given", () => {
    const genres = ["Drama", "Action"];
    buildEmbeddingText({ ...full, genres });

    expect(genres).toEqual(["Drama", "Action"]);
  });

  it("ignores spaces around the overview and tagline", () => {
    const a = buildEmbeddingText(full);
    const b = buildEmbeddingText({
      ...full,
      overview: "  A thief and a detective.   ",
      tagline: " A Los Angeles crime saga ",
    });

    expect(b).toBe(a);
  });
});

describe("hashEmbeddingText (AC-8, AC-9)", () => {
  it("returns the SHA 256 of the text as lowercase hex", () => {
    expect(hashEmbeddingText("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("changes when the text changes", () => {
    expect(hashEmbeddingText("a")).not.toBe(hashEmbeddingText("b"));
  });

  it("is the same for the same data every time", () => {
    expect(hashEmbeddingText(buildEmbeddingText(full))).toBe(
      hashEmbeddingText(buildEmbeddingText({ ...full })),
    );
  });
});

import { describe, expect, it } from "vitest";
import { toDbFailure } from "./failure";

/** An error shaped like the one `pg` throws, wrapped the way Drizzle wraps it. */
function drizzleError(cause: Record<string, unknown>) {
  return Object.assign(new Error("Failed query: select ..."), {
    cause: Object.assign(new Error(String(cause.message ?? "pg error")), cause),
  });
}

describe("toDbFailure", () => {
  describe("foreign key violations (23503)", () => {
    it.each([
      "ratings_movie_id_movies_id_fk",
      "swipe_skips_movie_id_movies_id_fk",
    ])("maps %s to movie_not_found", (constraint) => {
      const error = drizzleError({ code: "23503", constraint });
      expect(toDbFailure(error)).toEqual({ code: "movie_not_found" });
    });

    it.each([
      "ratings_user_id_user_id_fk",
      "profiles_user_id_user_id_fk",
      "swipe_skips_user_id_user_id_fk",
    ])("maps %s to user_not_found", (constraint) => {
      const error = drizzleError({ code: "23503", constraint });
      expect(toDbFailure(error)).toEqual({ code: "user_not_found" });
    });

    it("returns null for a foreign key it does not know", () => {
      const error = drizzleError({
        code: "23503",
        constraint: "credits_person_id_people_id_fk",
      });
      expect(toDbFailure(error)).toBeNull();
    });

    it("finds the driver error when it is the error itself, not wrapped", () => {
      const error = Object.assign(new Error("fk"), {
        code: "23503",
        constraint: "ratings_movie_id_movies_id_fk",
      });
      expect(toDbFailure(error)).toEqual({ code: "movie_not_found" });
    });
  });

  describe("connection problems", () => {
    it.each(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EPIPE"])(
      "maps the Node code %s to db_unavailable",
      (code) => {
        expect(toDbFailure(drizzleError({ code }))).toEqual({
          code: "db_unavailable",
        });
      },
    );

    it.each(["08006", "08001", "57P01", "57P02", "57P03", "53300"])(
      "maps the SQLSTATE %s to db_unavailable",
      (code) => {
        expect(toDbFailure(drizzleError({ code }))).toEqual({
          code: "db_unavailable",
        });
      },
    );

    // `pg` throws these as plain Errors with a message and no `code`.
    it.each([
      "Connection terminated unexpectedly",
      "timeout exceeded when trying to connect",
    ])("maps a plain Error saying %s to db_unavailable", (message) => {
      expect(toDbFailure(new Error(message))).toEqual({
        code: "db_unavailable",
      });
    });

    it.each([
      "Connection terminated unexpectedly",
      "timeout exceeded when trying to connect",
    ])(
      "maps a Drizzle wrapped plain Error saying %s to db_unavailable",
      (message) => {
        const wrapped = Object.assign(new Error("Failed query: select ..."), {
          cause: new Error(message),
        });
        expect(toDbFailure(wrapped)).toEqual({ code: "db_unavailable" });
      },
    );

    it("maps an error that has a code field set to undefined and a known message", () => {
      const error = Object.assign(
        new Error("Connection terminated unexpectedly"),
        {
          code: undefined,
        },
      );
      expect(toDbFailure(error)).toEqual({ code: "db_unavailable" });
    });
  });

  describe("things that are bugs, not expected failures", () => {
    it("returns null for a unique violation", () => {
      expect(toDbFailure(drizzleError({ code: "23505" }))).toBeNull();
    });

    it("returns null for a check violation", () => {
      expect(toDbFailure(drizzleError({ code: "23514" }))).toBeNull();
    });

    it("returns null for an ordinary Error", () => {
      expect(toDbFailure(new Error("something else broke"))).toBeNull();
    });

    it.each([
      ["a string", "boom"],
      ["null", null],
      ["undefined", undefined],
      ["a number", 42],
    ])("returns null for %s", (_name, value) => {
      expect(toDbFailure(value)).toBeNull();
    });
  });
});

import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  AUTH_TABLES_OUTSIDE_EXPORT,
  EXPORT_KEY_BY_TABLE,
  listTablesWithUserId,
} from "@/user-data/user-tables";

const allTables = Object.values(schema).flatMap((value) => {
  try {
    return [getTableConfig(value as PgTable)];
  } catch {
    return [];
  }
});

const tableNamed = (name: string) => {
  const config = allTables.find((table) => table.name === name);
  if (!config) throw new Error(`No table named ${name} in the schema`);
  return config;
};

describe("the Drizzle schema", () => {
  it("defines the 16 tables migration 1 creates (AC-1)", () => {
    const names = allTables.map((table) => table.name);
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

  it("fixes the embedding size at 1024 (AC-7)", () => {
    expect(schema.EMBEDDING_DIMENSIONS).toBe(1024);
  });

  describe("every user_id column (AC-15)", () => {
    const withUserId = listTablesWithUserId();

    it("is found on the six tables that hold user rows", () => {
      expect(withUserId.map((table) => table.name).sort()).toEqual(
        [
          "account",
          "imports",
          "profiles",
          "ratings",
          "session",
          "swipe_skips",
        ].sort(),
      );
    });

    it.each(withUserId.map((table) => [table.name]))(
      "%s: user_id is text and cascades from user.id",
      (name) => {
        const config = tableNamed(name);
        const column = config.columns.find((c) => c.name === "user_id");
        expect(column?.getSQLType()).toBe("text");

        const foreignKey = config.foreignKeys.find((fk) =>
          fk.reference().columns.some((c) => c.name === "user_id"),
        );
        expect(foreignKey).toBeDefined();
        expect(foreignKey?.onDelete).toBe("cascade");
        const reference = foreignKey?.reference();
        expect(getTableConfig(reference?.foreignTable as PgTable).name).toBe(
          "user",
        );
        expect(reference?.foreignColumns.map((c) => c.name)).toEqual(["id"]);
      },
    );
  });

  it.each(["ratings", "swipe_skips"])(
    "%s: the key to movies is restrict, so a rated movie cannot be deleted by accident",
    (name) => {
      const config = tableNamed(name);
      const foreignKey = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "movie_id"),
      );
      expect(foreignKey?.onDelete).toBe("restrict");
    },
  );

  it("names the foreign keys the way toDbFailure expects (movie and user keys)", () => {
    for (const name of ["ratings", "swipe_skips"]) {
      const names = tableNamed(name).foreignKeys.map((fk) => fk.getName());
      expect(names).toContain(`${name}_movie_id_movies_id_fk`);
      expect(names).toContain(`${name}_user_id_user_id_fk`);
    }
  });
});

describe("the export registry (AC-12, AC-13)", () => {
  const withUserId = listTablesWithUserId().map((table) => table.name);
  const exported = Object.keys(EXPORT_KEY_BY_TABLE);
  const outside: readonly string[] = AUTH_TABLES_OUTSIDE_EXPORT;

  it("covers every table that has a user_id column, in the export or on the outside list", () => {
    const missing = withUserId.filter(
      (name) => !exported.includes(name) && !outside.includes(name),
    );
    expect(missing).toEqual([]);
  });

  it("does not list a table in both places", () => {
    expect(exported.filter((name) => outside.includes(name))).toEqual([]);
  });

  it("does not name tables that no longer exist", () => {
    const stale = [...exported, ...outside].filter(
      (name) => !withUserId.includes(name),
    );
    expect(stale).toEqual([]);
  });

  it("keeps Better Auth's session and account tables out of the export", () => {
    expect(outside).toEqual(expect.arrayContaining(["session", "account"]));
    expect(exported).not.toContain("session");
    expect(exported).not.toContain("account");
  });
});

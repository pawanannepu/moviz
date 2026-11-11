import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/create-db";
import { recommendMovies } from "./recommend-movies";

// Spec 0008, AC-14 and the root AGENTS.md rule: no rating, score, title or
// movie id may reach a log. Drizzle puts the query parameters in its error
// message, so an unexpected error must not leave the recommender as is: the
// page and the action pass it on to Next.js, which logs it on the server.

const USER_ID = "user-secret-7f3a";
const MOVIE_ID = 424242;
const WEIGHT = 0.8765;

/** A database whose transaction fails the way Drizzle reports a query that is a bug. */
function failingDb(cause: unknown): Db {
  const error = new DrizzleQueryError(
    "select ... where user_id = $1 and movie_id = $2 and weight > $3",
    [USER_ID, MOVIE_ID, WEIGHT],
    cause as Error,
  );
  return {
    transaction: () => Promise.reject(error),
  } as unknown as Db;
}

/** Everything a logger could print from an error: message, stack, own fields and causes. */
function everythingLoggable(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current !== "object") break;
    const record = current as Record<string, unknown> & Error;
    parts.push(String(record.message), String(record.stack));
    for (const key of Object.keys(record)) {
      parts.push(key, JSON.stringify(record[key]) ?? "");
    }
    current = record.cause;
  }
  return parts.join("\n");
}

async function thrownBy(db: Db): Promise<unknown> {
  try {
    await recommendMovies(db, {
      userId: USER_ID,
      limit: 24,
      shown: [MOVIE_ID],
    });
  } catch (error) {
    return error;
  }
  throw new Error("expected recommendMovies to throw");
}

describe("recommendMovies unexpected errors (AC-14)", () => {
  it("throws an error that holds no user id, movie id or score", async () => {
    const pgError = Object.assign(new Error("operator does not exist"), {
      code: "42883",
    });

    const logged = everythingLoggable(await thrownBy(failingDb(pgError)));

    expect(logged).not.toContain(USER_ID);
    expect(logged).not.toContain(String(MOVIE_ID));
    expect(logged).not.toContain(String(WEIGHT));
  });

  it("keeps the SQLSTATE, so the log still says what kind of failure it was", async () => {
    const pgError = Object.assign(new Error("operator does not exist"), {
      code: "42883",
    });

    const error = await thrownBy(failingDb(pgError));

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("42883");
  });

  it("does not hide a database outage: that is still the db_unavailable result", async () => {
    const pgError = Object.assign(new Error("terminating connection"), {
      code: "57P01",
    });

    const result = await recommendMovies(failingDb(pgError), {
      userId: USER_ID,
      limit: 24,
      shown: [],
    });

    expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
  });

  it("names a plain code bug by its kind only, with no message that could hold data", async () => {
    const db = {
      transaction: () =>
        Promise.reject(
          new TypeError(`Cannot read movie ${MOVIE_ID} for ${USER_ID}`),
        ),
    } as unknown as Db;

    const error = await thrownBy(db);
    const logged = everythingLoggable(error);

    expect((error as Error).message).toContain("TypeError");
    expect(logged).not.toContain(USER_ID);
    expect(logged).not.toContain(String(MOVIE_ID));
  });
});

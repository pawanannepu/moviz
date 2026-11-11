import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { ActionUserResult } from "@/auth/session";
import type { Db } from "@/db/create-db";
import { imports, ratings } from "@/db/schema";
import {
  forbiddenDb,
  TEST_DATABASE_URL,
  token,
  useTestDb,
} from "@/test-support/test-db";
import { MAX_FILE_BYTES } from "./constants";
import { handleImport, type ImportDeps } from "./handle-import";

// Spec 0009: the body of POST /api/import/letterboxd. Refusals that come before
// any database work run without a database (a `forbiddenDb` fails the test if
// touched). The full flow runs on the Neon test branch.
const ORIGIN = "http://localhost:3000";
const URL = `${ORIGIN}/api/import/letterboxd`;
const HEADER = "Date,Name,Year,Letterboxd URI,Rating";
const q = (s: string) => `"${s.replaceAll('"', '""')}"`;

const signedIn =
  (id = "user-1"): (() => Promise<ActionUserResult>) =>
  async () => ({
    ok: true,
    user: { id } as never,
  });
const signedOut = async (): Promise<ActionUserResult> => ({
  ok: false,
  error: "unauthenticated",
});

function upload(
  content: string | Uint8Array<ArrayBuffer> | null,
  headers: Record<string, string | null> = { origin: ORIGIN },
) {
  const form = new FormData();
  if (content !== null) {
    form.set("file", new File([content], "ratings.csv", { type: "text/csv" }));
  }
  const clean = Object.fromEntries(
    Object.entries(headers).filter(([, v]) => v !== null),
  ) as Record<string, string>;
  return new Request(URL, { method: "POST", headers: clean, body: form });
}

async function run(request: Request, deps: Partial<ImportDeps> & { db: Db }) {
  const lines: string[] = [];
  const response = await handleImport(request, {
    getUser: signedIn(),
    trustedOrigins: [ORIGIN],
    log: (line) => lines.push(line),
    ...deps,
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    lines,
  };
}

describe("handleImport refuses before any database work", () => {
  it("answers 401 unauthenticated when there is no session, and checks nothing else (AC-12)", async () => {
    const result = await run(
      upload(`${HEADER}\n`, { origin: "http://evil.test" }),
      {
        db: forbiddenDb,
        getUser: signedOut,
      },
    );
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ ok: false, error: "unauthenticated" });
  });

  it.each([
    ["a different origin", { origin: "http://evil.test" }],
    ["no Origin header", {}],
    ["an origin with a different port", { origin: "http://localhost:3001" }],
    [
      "an origin that only starts like a trusted one",
      { origin: `${ORIGIN}.evil.test` },
    ],
  ])("answers 403 bad_origin for %s (AC-12)", async (_label, headers) => {
    const result = await run(upload(`${HEADER}\n`, headers), {
      db: forbiddenDb,
    });
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ ok: false, error: "bad_origin" });
  });

  it("accepts any of several trusted origins, and passes the origin check (AC-12)", async () => {
    const other = "https://preview-123.vercel.app";
    // Past the origin check the handler needs the database. The forbidden one
    // throws, so a thrown error (not a 403) proves the check let the request on.
    await expect(
      run(upload("", { origin: other }), {
        db: forbiddenDb,
        trustedOrigins: [ORIGIN, other],
      }),
    ).rejects.toThrow("handleImport failed");
  });

  it("throws a clean error with no detail when the database fails in a way it does not expect (AC-13)", async () => {
    const leaky = {
      execute: async () => {
        throw new Error(
          "select ... where user_id = 'secret-user' and title = 'Secret Film'",
        );
      },
    } as unknown as Db;

    const failure = await run(upload(`${HEADER}\n`), { db: leaky }).catch(
      (e) => e,
    );

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure.message)).toBe(
      "handleImport failed: Error (code none)",
    );
    expect(String(failure.message)).not.toContain("secret");
  });

  it("answers 400 no_file when the form has no file field (AC-3)", async () => {
    const result = await run(upload(null), { db: forbiddenDb });
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ ok: false, error: "no_file" });
  });

  it("answers 400 no_file when the file field is plain text, not a file (AC-3)", async () => {
    const form = new FormData();
    form.set("file", "just text");
    const request = new Request(URL, {
      method: "POST",
      headers: { origin: ORIGIN },
      body: form,
    });
    const result = await run(request, { db: forbiddenDb });
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ ok: false, error: "no_file" });
  });

  it("answers 400 no_file when the body is not a form at all (AC-3)", async () => {
    const request = new Request(URL, {
      method: "POST",
      headers: { origin: ORIGIN },
      body: "not a form",
    });
    const result = await run(request, { db: forbiddenDb });
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ ok: false, error: "no_file" });
  });

  it("answers 413 file_too_large from the Content-Length header, without reading the body (AC-3)", async () => {
    const formData = vi.fn();
    const request = {
      headers: new Headers({
        origin: ORIGIN,
        "content-length": String(MAX_FILE_BYTES + 1_000_000),
      }),
      formData,
    } as unknown as Request;
    const result = await run(request, { db: forbiddenDb });
    expect(result.status).toBe(413);
    expect(result.body).toEqual({ ok: false, error: "file_too_large" });
    expect(formData).not.toHaveBeenCalled();
  });

  it("answers 413 file_too_large for a file one byte over 2 MB (AC-3)", async () => {
    const result = await run(upload(new Uint8Array(MAX_FILE_BYTES + 1)), {
      db: forbiddenDb,
    });
    expect(result.status).toBe(413);
    expect(result.body).toEqual({ ok: false, error: "file_too_large" });
  });

  it("writes one log line per refusal that holds only the outcome and the duration (AC-13)", async () => {
    const result = await run(
      upload(`${HEADER}\n`, { origin: "http://evil.test" }),
      { db: forbiddenDb },
    );
    expect(result.lines).toHaveLength(1);
    const line = JSON.parse(result.lines[0]);
    expect(Object.keys(line).sort()).toEqual(["ms", "outcome", "type"]);
    expect(line).toMatchObject({ type: "import", outcome: "bad_origin" });
  });
});

describe("handleImport when the database is down (AC-7)", () => {
  const downDb = {
    execute: async () => {
      throw Object.assign(new Error("connection terminated"), {
        code: "57P01",
      });
    },
  } as unknown as Db;

  it("answers 503 db_unavailable without a stack trace or any detail", async () => {
    const result = await run(upload(`${HEADER}\n,Heat,1995,u,4\n`), {
      db: downDb,
    });
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ ok: false, error: "db_unavailable" });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("handleImport (database)", () => {
  const t = useTestDb();

  const film = (year = 2001, title?: string) =>
    t.fx.newMovie({
      releaseDate: `${year}-05-05`,
      ...(title ? { title } : {}),
    });
  const csv = (...lines: string[]) => `${HEADER}\n${lines.join("\n")}\n`;
  const importsOf = (userId: string) =>
    t.db.select().from(imports).where(eq(imports.userId, userId));
  const go = (
    userId: string,
    content: string | Uint8Array<ArrayBuffer> | null,
  ) => run(upload(content), { db: t.db, getUser: signedIn(userId) });

  it("saves the matching rows and answers with the counts and onboarded (AC-1, AC-2)", async () => {
    const user = await t.fx.newUser();
    const [a, b] = [await film(), await film()];

    const result = await go(
      user.id,
      csv(
        `2024-03-02,${q(a.title)},2001,u,4.5`,
        `2024-03-02,${q(b.title)},2001,u,3`,
        `2024-03-02,${q("Zq no such film " + token())},1931,u,3`,
      ),
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      rowsTotal: 3,
      rowsMatched: 2,
      rowsUnmatched: 1,
      onboarded: false,
    });
    expect(typeof result.body.importId).toBe("number");
    const saved = await t.db
      .select()
      .from(ratings)
      .where(eq(ratings.userId, user.id));
    expect(saved.map((r) => [r.score, r.source]).sort()).toEqual([
      [6, "import"],
      [9, "import"],
    ]);
  });

  it("matches an accented title with a lower case, unaccented one and a year that is one off (AC-4)", async () => {
    const user = await t.fx.newUser();
    const key = token();
    const accented = await t.fx.newMovie({
      title: `Amélie Zq${key}`,
      releaseDate: "2001-04-25",
    });

    const result = await go(user.id, csv(`,amelie zq${key},2002,u,4`));

    expect(result.body).toMatchObject({ rowsMatched: 1, rowsUnmatched: 0 });
    expect(await t.db.$count(ratings, eq(ratings.movieId, accented.id))).toBe(
      1,
    );
  });

  it("leaves two movies with the same title and year as ambiguous, saving neither (AC-4)", async () => {
    const user = await t.fx.newUser();
    const title = `Twin Zq${token()}`;
    await film(2001, title);
    await film(2001, title);

    const result = await go(user.id, csv(`,${q(title)},2001,u,4`));

    expect(result.body).toMatchObject({ rowsMatched: 0, rowsUnmatched: 1 });
    expect(await t.db.$count(ratings, eq(ratings.userId, user.id))).toBe(0);
  });

  it("refuses a zip, a wrong header and an empty file with 422 and stores no import (AC-3)", async () => {
    const user = await t.fx.newUser();
    const cases: [string | Uint8Array<ArrayBuffer>, string][] = [
      [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]), "looks_like_zip"],
      ["Foo,Bar\n1,2\n", "not_letterboxd_ratings"],
      [`${HEADER}\n`, "empty_file"],
    ];
    for (const [content, code] of cases) {
      const result = await go(user.id, content);
      expect(result.status).toBe(422);
      expect(result.body).toEqual({ ok: false, error: code });
    }
    expect(await importsOf(user.id)).toHaveLength(0);
  });

  it("checks the daily limit before it looks at the file, so a sixth upload gets 429 even for a zip (AC-9)", async () => {
    const user = await t.fx.newUser();
    for (let i = 0; i < 5; i++) {
      await t.db.insert(imports).values({
        userId: user.id,
        status: "completed",
        rowsTotal: 0,
        rowsMatched: 0,
        rowsUnmatched: 0,
      });
    }

    const result = await go(
      user.id,
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]),
    );

    expect(result.status).toBe(429);
    expect(result.body.error).toBe("daily_limit");
    expect(String(result.body.resetAt)).toMatch(/T00:00:00\.000Z$/);
    expect(await importsOf(user.id)).toHaveLength(5);
  });

  it("does not count a rejected file against the day's limit (AC-9)", async () => {
    const user = await t.fx.newUser();
    for (let i = 0; i < 6; i++) await go(user.id, "Foo,Bar\n1,2\n");
    const film1 = await film();

    const result = await go(user.id, csv(`,${q(film1.title)},2001,u,4`));

    expect(result.status).toBe(200);
  });

  it("answers 401 when the account was deleted while the import ran (AC-7)", async () => {
    const film1 = await film();
    const result = await go(
      "user-that-does-not-exist",
      csv(`,${q(film1.title)},2001,u,4`),
    );
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("keeps titles, scores and ids out of the log line and out of every response body (AC-13)", async () => {
    const user = await t.fx.newUser();
    const marker = `Zq Secret Title ${token()}`;
    const movie = await film(2001, marker);

    const good = await go(
      user.id,
      csv(`,${q(marker)},2001,u,4.5`, `,${q("Other " + marker)},1931,u,3`),
    );
    const bad = await go(user.id, "Foo,Bar\n1,2\n");

    for (const result of [good, bad]) {
      const everything = JSON.stringify(result.body) + result.lines.join("\n");
      expect(everything).not.toContain(marker);
      expect(everything).not.toContain(String(movie.id) + ",");
    }
    expect(good.lines).toHaveLength(1);
    const line = JSON.parse(good.lines[0]);
    expect(Object.keys(line).sort()).toEqual([
      "ms",
      "outcome",
      "rowsMatched",
      "rowsTotal",
      "rowsUnmatched",
      "type",
    ]);
    expect(line).toMatchObject({
      outcome: "ok",
      rowsTotal: 2,
      rowsMatched: 1,
      rowsUnmatched: 1,
    });
  });

  it("reads the user from the session, never from the request (AC-12)", async () => {
    const [me, other] = [await t.fx.newUser(), await t.fx.newUser()];
    const movie = await film();
    const form = new FormData();
    form.set(
      "file",
      new File([csv(`,${q(movie.title)},2001,u,4`)], "ratings.csv"),
    );
    form.set("userId", other.id);
    const request = new Request(URL, {
      method: "POST",
      headers: { origin: ORIGIN },
      body: form,
    });

    const result = await run(request, { db: t.db, getUser: signedIn(me.id) });

    expect(result.status).toBe(200);
    expect(await t.db.$count(ratings, eq(ratings.userId, me.id))).toBe(1);
    expect(await t.db.$count(ratings, eq(ratings.userId, other.id))).toBe(0);
  });
});

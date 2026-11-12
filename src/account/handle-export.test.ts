import { describe, expect, it, vi } from "vitest";
import type { AuthEvent } from "@/auth/log-auth-event";
import type { ActionUserResult } from "@/auth/session";
import type { Db } from "@/db/create-db";
import { err, ok } from "@/lib/result";
import type { UserExport } from "@/user-data/export-user-data";
import { type ExportDeps, exportFileName, handleExport } from "./handle-export";

// Spec 0014: `GET /api/account/export` (AC-7, AC-14).

const DB = {} as Db;

const SIGNED_IN: ActionUserResult = {
  ok: true,
  user: { id: "user_1", email: "fan@example.com" } as never,
};

const DOCUMENT = {
  schemaVersion: 1,
  exportedAt: "2026-11-12T23:59:59.000Z",
  account: {
    id: "user_1",
    email: "fan@example.com",
    name: "fan",
    emailVerified: true,
    createdAt: "2026-11-01T00:00:00.000Z",
  },
} as unknown as UserExport;

function setup(overrides: Partial<ExportDeps> = {}) {
  const lines: AuthEvent[] = [];
  const exportData = vi.fn<ExportDeps["exportData"]>(async () => ok(DOCUMENT));
  const deps: ExportDeps = {
    db: DB,
    getUser: async () => SIGNED_IN,
    exportData,
    log: (line) => lines.push(line),
    ...overrides,
  };
  return { deps, lines, exportData };
}

describe("handleExport, signed in (AC-7)", () => {
  it("returns the export as a JSON attachment that is never cached", async () => {
    const { deps } = setup();

    const response = await handleExport(deps);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="moviz-data-2026-11-12.json"',
    );
    expect(await response.json()).toEqual(DOCUMENT);
  });

  it("builds the export for the session user only (AC-14)", async () => {
    const { deps, exportData } = setup();

    await handleExport(deps);

    expect(exportData).toHaveBeenCalledTimes(1);
    expect(exportData).toHaveBeenCalledWith(DB, { userId: "user_1" });
  });

  it("logs one data_exported line with the outcome and user id only (AC-14)", async () => {
    const { deps, lines } = setup();

    await handleExport(deps);

    expect(lines).toEqual([
      { event: "data_exported", outcome: "ok", userId: "user_1" },
    ]);
  });
});

describe("handleExport, refusals (AC-7)", () => {
  it("answers 401 with no data and never reads the database when signed out", async () => {
    const { deps, lines, exportData } = setup({
      getUser: async () => ({ ok: false, error: "unauthenticated" }),
    });

    const response = await handleExport(deps);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(exportData).not.toHaveBeenCalled();
    expect(lines).toEqual([
      { event: "data_exported", outcome: "unauthenticated" },
    ]);
  });

  it("answers 401 when the user is gone mid request", async () => {
    const { deps, lines } = setup({
      exportData: async () => err({ code: "user_not_found" }),
    });

    const response = await handleExport(deps);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(lines).toEqual([
      { event: "data_exported", outcome: "user_not_found", userId: "user_1" },
    ]);
  });

  it("answers 503 when the database is unavailable", async () => {
    const { deps } = setup({
      exportData: async () => err({ code: "db_unavailable" }),
    });

    const response = await handleExport(deps);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: "db_unavailable",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503, never a raw 500, when the export throws, and keeps the error out of the log", async () => {
    const { deps, lines } = setup({
      exportData: async () => {
        throw new Error("select failed for fan@example.com");
      },
    });

    const response = await handleExport(deps);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('{"ok":false,"error":"db_unavailable"}');
    expect(JSON.stringify(lines)).not.toContain("fan@example.com");
    expect(lines).toEqual([
      { event: "data_exported", outcome: "db_unavailable", userId: "user_1" },
    ]);
  });
});

describe("exportFileName (AC-7)", () => {
  it("takes the UTC date from exportedAt", () => {
    expect(exportFileName("2026-11-12T23:59:59.999Z")).toBe(
      "moviz-data-2026-11-12.json",
    );
  });

  it("uses the UTC day just after midnight UTC", () => {
    expect(exportFileName("2026-11-13T00:00:00.000Z")).toBe(
      "moviz-data-2026-11-13.json",
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionApi = vi.fn();

vi.mock("./auth", () => ({ auth: { api: { getSession: getSessionApi } } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "better-auth.session_token=x" }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
// `cache` dedupes per request in Next; here it must not hide a second call.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

beforeEach(() => {
  getSessionApi.mockReset();
  getSessionApi.mockResolvedValue({ user: { id: "u1" }, session: {} });
});

describe("server side session reads never renew (AC-4)", () => {
  // A Server Component can extend the database row but cannot write the
  // cookie. If it renews first, the browser's own get-session call finds
  // nothing due and the cookie never moves forward.
  it("getSession asks Better Auth not to refresh", async () => {
    const { getSession } = await import("./session");
    await getSession();
    expect(getSessionApi).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableRefresh: true } }),
    );
  });

  it("getUserForAction asks Better Auth not to refresh", async () => {
    const { getUserForAction } = await import("./session");
    const result = await getUserForAction();
    expect(result).toEqual({ ok: true, user: { id: "u1" } });
    expect(getSessionApi).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableRefresh: true } }),
    );
  });

  it("getUserForAction returns a typed result when signed out", async () => {
    getSessionApi.mockResolvedValue(null);
    const { getUserForAction } = await import("./session");
    expect(await getUserForAction()).toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });
});

// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LatestImport } from "./get-latest-import";
import { ImportResult } from "./import-result";
import type { UnmatchedPage, UnmatchedPageRow } from "./list-unmatched";
import { UnmatchedList } from "./unmatched-list";

// The Server Action reads the database, so the list gets a stand in.
vi.mock("./actions", () => ({ loadMoreUnmatchedAction: vi.fn() }));

afterEach(cleanup);

const rows = (prefix: string, count: number): UnmatchedPageRow[] =>
  Array.from({ length: count }, (_, i) => ({
    rowNumber: i + 1,
    title: `${prefix} ${i + 1}`,
    year: 1931,
    reason: "no_match",
  }));

const completed = (
  id: number,
  prefix: string,
  count: number,
  nextCursor: string | null,
): LatestImport => ({
  id,
  status: "completed",
  rowsTotal: count + 2,
  rowsMatched: 2,
  rowsUnmatched: count,
  firstPage: { rows: rows(prefix, Math.min(count, 50)), nextCursor },
});

describe("a new import on a page that already shows one (spec 0009, AC-2, AC-11)", () => {
  it("shows the rows of the newest import, not the one it replaced", () => {
    const { rerender } = render(
      <ImportResult latest={completed(1, "First", 3, null)} onboarded />,
    );
    expect(screen.getByText(/First 1/)).toBeTruthy();

    rerender(
      <ImportResult latest={completed(2, "Second", 60, "50")} onboarded />,
    );

    expect(screen.queryByText(/First 1/)).toBeNull();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(50);
    expect(items[0]?.textContent).toMatch(/^Second 1/);
    expect(screen.getByText("Rows we left out (60)")).toBeTruthy();
  });

  it("offers Load more for the newest import, and asks for that import's rows", async () => {
    const loadMore = vi.fn().mockResolvedValue({
      ok: true,
      value: { rows: [], nextCursor: null } satisfies UnmatchedPage,
    });
    const { rerender } = render(
      <ImportResult
        latest={completed(1, "First", 3, null)}
        onboarded
        loadMore={loadMore}
      />,
    );
    expect(screen.queryByRole("button", { name: "Load more rows" })).toBeNull();

    rerender(
      <ImportResult
        latest={completed(2, "Second", 60, "50")}
        onboarded
        loadMore={loadMore}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more rows" }));

    await waitFor(() =>
      expect(loadMore).toHaveBeenCalledWith({ importId: 2, after: "50" }),
    );
  });
});

describe("why Load more failed (spec 0009, Messages)", () => {
  async function failWith(code: string) {
    const loadMore = vi.fn().mockResolvedValue({ ok: false, error: { code } });
    render(
      <UnmatchedList
        importId={7}
        total={60}
        initial={{ rows: rows("Row", 50), nextCursor: "50" }}
        loadMore={loadMore}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more rows" }));
    await waitFor(() =>
      expect(
        screen.getByText(/./, { selector: '[data-slot="load-more-bar"] p' })
          .textContent?.length,
      ).toBeGreaterThan(0),
    );
    return document.querySelector('[data-slot="load-more-bar"] p')?.textContent;
  }

  it("says the import is gone when it was removed", async () => {
    expect(await failWith("not_found")).toBe(
      "That import is no longer saved. Reload the page.",
    );
  });

  it("asks for a reload when the cursor or the input was rejected", async () => {
    const message =
      "We could not load more rows. Reload the page and try again.";
    expect(await failWith("invalid_cursor")).toBe(message);
    cleanup();
    expect(await failWith("invalid_input")).toBe(message);
  });

  it("keeps the connection wording for a database failure", async () => {
    expect(await failWith("db_unavailable")).toBe(
      "We couldn't load more rows. Check your connection and try again.",
    );
  });

  it("keeps the sign in wording when the session ended", async () => {
    expect(await failWith("unauthenticated")).toBe(
      "Your session ended. Sign in to see more rows.",
    );
  });
});

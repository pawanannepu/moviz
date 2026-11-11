"use client";

import {
  type ImportFormStatus,
  ImportFormView,
} from "@/import/import-form-view";
import { ImportResult } from "@/import/import-result";
import type { UnmatchedPageRow } from "@/import/list-unmatched";
import type { ImportErrorCode } from "@/import/messages";
import type { UnmatchedReason } from "@/import/row-rules";
import { CountTile, CountTiles } from "@/ui/count-tile";
import { FileField } from "@/ui/file-field";

const REASONS: UnmatchedReason[] = [
  "no_match",
  "ambiguous",
  "invalid_row",
  "duplicate",
  "kept_manual",
];

function fakeRows(from: number, count: number): UnmatchedPageRow[] {
  return Array.from({ length: count }, (_, index) => {
    const rowNumber = from + index;
    return {
      rowNumber,
      title: `A film from your file ${rowNumber}`,
      year: 1950 + (rowNumber % 70),
      reason: REASONS[rowNumber % REASONS.length] ?? "no_match",
    };
  });
}

/** A pretend Server Action: pages of 50 from a list of 120, after half a second. */
async function fakeLoadMore(input: unknown) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const after = (input as { after: string | null }).after;
  const from = after ? Number(after) + 1 : 51;
  const rows = fakeRows(from, Math.min(50, 121 - from));
  const last = rows[rows.length - 1];
  return {
    ok: true as const,
    value: {
      rows,
      nextCursor: last && last.rowNumber < 120 ? String(last.rowNumber) : null,
    },
  };
}

const ERROR_CODES: ImportErrorCode[] = [
  "no_file",
  "file_too_large",
  "looks_like_zip",
  "not_letterboxd_ratings",
  "empty_file",
  "daily_limit",
  "db_unavailable",
  "unauthenticated",
  "bad_origin",
];

const noop = () => undefined;

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="type-small">{label}</p>
      {children}
    </div>
  );
}

/**
 * The Letterboxd import pieces in every state, for the `/design` page (spec 0009).
 * Nothing is sent: the form buttons do nothing, and "Load more rows" uses a
 * pretend action.
 */
export function ImportDemo() {
  const forms: { label: string; status: ImportFormStatus }[] = [
    { label: "Form: ready", status: { kind: "idle" } },
    { label: "Form: importing", status: { kind: "working" } },
    {
      label: "Form: done",
      status: { kind: "success", matched: 412, total: 1280 },
    },
    ...ERROR_CODES.map((code) => ({
      label: `Form: error, ${code}`,
      status: {
        kind: "error" as const,
        code,
        resetAt: new Date("2030-01-02T00:00:00Z"),
      },
    })),
  ];

  const rows = fakeRows(1, 50);
  return (
    <div className="flex flex-col gap-10">
      <Labelled label="File field: ready, with a hint, and with an error">
        <div className="grid max-w-xl gap-6">
          <FileField label="ratings.csv" name="demo-file" />
          <FileField
            label="ratings.csv with a hint"
            name="demo-file-hint"
            hint="A CSV file up to 2 MB."
          />
          <FileField
            label="ratings.csv with an error"
            name="demo-file-error"
            error="Choose your ratings.csv file first."
          />
        </div>
      </Labelled>

      <Labelled label="Count tiles">
        <CountTiles>
          <CountTile label="Rows read" value={1280} />
          <CountTile label="Matched" value={412} />
          <CountTile label="Not matched" value={868} />
        </CountTiles>
      </Labelled>

      {forms.map(({ label, status }) => (
        <Labelled key={label} label={label}>
          <ImportFormView
            status={status}
            onSubmit={noop}
            onDismissError={noop}
            focusAlert={false}
          />
        </Labelled>
      ))}

      <Labelled label="Result: onboarded, 120 rows left out (Load more rows works)">
        <ImportResult
          latest={{
            id: 1,
            status: "completed",
            rowsTotal: 1280,
            rowsMatched: 1160,
            rowsUnmatched: 120,
            firstPage: { rows, nextCursor: "50" },
          }}
          onboarded
          loadMore={fakeLoadMore}
        />
      </Labelled>
      <Labelled label="Result: not onboarded yet, nothing matched">
        <ImportResult
          latest={{
            id: 2,
            status: "completed",
            rowsTotal: 2,
            rowsMatched: 0,
            rowsUnmatched: 2,
            firstPage: { rows: fakeRows(1, 2), nextCursor: null },
          }}
          onboarded={false}
        />
      </Labelled>
      <Labelled label="Result: every row matched">
        <ImportResult
          latest={{
            id: 3,
            status: "completed",
            rowsTotal: 40,
            rowsMatched: 40,
            rowsUnmatched: 0,
            firstPage: { rows: [], nextCursor: null },
          }}
          onboarded
        />
      </Labelled>
      <Labelled label="Result: the last save failed">
        <ImportResult
          latest={{
            id: 4,
            status: "failed",
            rowsTotal: 300,
            rowsMatched: 0,
            rowsUnmatched: 0,
            firstPage: { rows: [], nextCursor: null },
          }}
          onboarded
        />
      </Labelled>
    </div>
  );
}

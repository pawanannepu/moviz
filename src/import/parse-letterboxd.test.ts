import { describe, expect, it } from "vitest";
import { parseLetterboxd } from "./parse-letterboxd";

// Spec 0009: a file is refused as a whole, or read into rows of text (AC-3,
// AC-4, AC-16). Pure: bytes in, rows or a code out.
const bytes = (text: string) => new TextEncoder().encode(text);
const HEADER = "Date,Name,Year,Letterboxd URI,Rating";

function rowsOf(text: string) {
  const parsed = parseLetterboxd(bytes(text));
  if (!parsed.ok) throw new Error(`expected rows, got ${parsed.error.code}`);
  return parsed.value;
}

describe("parseLetterboxd rejects a whole file (AC-3)", () => {
  it("recognises a zip by its first four bytes", () => {
    expect(
      parseLetterboxd(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0])),
    ).toEqual({ ok: false, error: { code: "looks_like_zip" } });
  });

  it("does not call a file a zip just because it starts with P", () => {
    const parsed = parseLetterboxd(bytes("PK is not a zip header\n"));
    expect(parsed).toEqual({
      ok: false,
      error: { code: "not_letterboxd_ratings" },
    });
  });

  it.each([
    ["no bytes at all", ""],
    ["only whitespace", "  \n \n"],
  ])("calls %s an empty file", (_label, text) => {
    expect(parseLetterboxd(bytes(text))).toEqual({
      ok: false,
      error: { code: "empty_file" },
    });
  });

  it("calls a header with no data rows an empty file", () => {
    expect(parseLetterboxd(bytes(`${HEADER}\n`))).toEqual({
      ok: false,
      error: { code: "empty_file" },
    });
  });

  it("refuses a header that lacks Name, Year or Rating", () => {
    for (const header of [
      "Foo,Bar",
      "Name,Year",
      "Name,Rating",
      "Year,Rating",
    ]) {
      expect(parseLetterboxd(bytes(`${header}\n1,2\n`))).toEqual({
        ok: false,
        error: { code: "not_letterboxd_ratings" },
      });
    }
  });

  it("refuses a file with a broken quote", () => {
    expect(
      parseLetterboxd(bytes('Name,Year,Rating\n"unclosed,1999,3\n')),
    ).toEqual({ ok: false, error: { code: "not_letterboxd_ratings" } });
  });

  it("refuses bytes that are not UTF-8", () => {
    expect(parseLetterboxd(new Uint8Array([0xff, 0xfe, 0x41]))).toEqual({
      ok: false,
      error: { code: "not_letterboxd_ratings" },
    });
  });
});

describe("parseLetterboxd reads rows (AC-1, AC-4)", () => {
  it("reads the Letterboxd columns and numbers data rows from 1", () => {
    const rows = rowsOf(
      `${HEADER}\n2024-01-02,Heat,1995,https://boxd.it/1,4.5\n2024-01-03,Collateral,2004,https://boxd.it/2,3\n`,
    );
    expect(rows).toEqual([
      {
        rowNumber: 1,
        name: "Heat",
        year: "1995",
        rating: "4.5",
        date: "2024-01-02",
      },
      {
        rowNumber: 2,
        name: "Collateral",
        year: "2004",
        rating: "3",
        date: "2024-01-03",
      },
    ]);
  });

  it("matches header names after trimming and ignoring case", () => {
    const rows = rowsOf(" NAME ,year, Rating ,DATE\nHeat,1995,4,2024-01-02\n");
    expect(rows[0]).toEqual({
      rowNumber: 1,
      name: "Heat",
      year: "1995",
      rating: "4",
      date: "2024-01-02",
    });
  });

  it("ignores columns it does not use and reads a file with no Date column", () => {
    const rows = rowsOf("Rating,Extra,Name,Year\n4,whatever,Heat,1995\n");
    expect(rows[0]).toMatchObject({
      name: "Heat",
      year: "1995",
      rating: "4",
      date: "",
    });
  });

  it("strips a byte order mark before the header", () => {
    expect(rowsOf(`﻿${HEADER}\n,Heat,1995,u,4\n`)).toHaveLength(1);
  });

  it("reads a quoted title with a comma, a doubled quote and a line break", () => {
    const rows = rowsOf(
      `${HEADER}\n2024-01-02,"Heat, the ""film""\nsecond line",1995,u,4\n`,
    );
    expect(rows[0].name).toBe('Heat, the "film"\nsecond line');
  });

  it("keeps non ASCII titles whole", () => {
    expect(rowsOf(`${HEADER}\n,Amélie,2001,u,5\n`)[0].name).toBe("Amélie");
  });

  it("skips blank lines without losing the row count", () => {
    const rows = rowsOf(
      `${HEADER}\n\n,Heat,1995,u,4\n\n,Collateral,2004,u,3\n`,
    );
    expect(rows.map((r) => r.rowNumber)).toEqual([1, 2]);
  });

  it("keeps a ragged row, with its missing cells as empty text, so it can become one invalid row", () => {
    const rows = rowsOf("Name,Year,Rating\nHeat\nCollateral,2004,3\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Heat", year: "", rating: "" });
    expect(rows[1]).toMatchObject({ name: "Collateral", year: "2004" });
  });

  it("reads a row that has more cells than the header", () => {
    const rows = rowsOf("Name,Year,Rating\nHeat,1995,4,extra,cells\n");
    expect(rows[0]).toMatchObject({ name: "Heat", year: "1995", rating: "4" });
  });

  it("reads thousands of rows (AC-16)", () => {
    const lines = Array.from(
      { length: 20_000 },
      (_, i) => `,Film ${i},1999,u,3`,
    );
    expect(rowsOf(`${HEADER}\n${lines.join("\n")}\n`)).toHaveLength(20_000);
  });
});

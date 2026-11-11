import { parse } from "csv-parse/sync";
import { err, ok, type Result } from "@/lib/result";
import type { RawRow } from "./row-rules";

/** The ways a whole file is refused before any row is looked at (spec 0009, AC-3). */
export type ParseError =
  | { code: "looks_like_zip" }
  | { code: "not_letterboxd_ratings" }
  | { code: "empty_file" };

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const REQUIRED_COLUMNS = ["name", "year", "rating"] as const;

function startsWithZipMagic(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((byte, index) => bytes[index] === byte);
}

/**
 * Reads the bytes of a Letterboxd `ratings.csv` into rows of text. Pure.
 *
 * - A file that starts with the zip signature is `looks_like_zip`.
 * - Text that is not UTF-8, a broken quote, or a header without `Name`, `Year`
 *   and `Rating` is `not_letterboxd_ratings`. Header names are matched after
 *   trimming and lower casing, and any other column is ignored.
 * - A blank file, or a header with no data rows, is `empty_file`.
 * - A ragged row is kept, with its missing cells as empty strings, so one bad
 *   row costs one row (`invalid_row`) and not the file.
 *
 * Row numbers start at 1 for the first data row.
 */
export function parseLetterboxd(
  bytes: Uint8Array,
): Result<RawRow[], ParseError> {
  if (startsWithZipMagic(bytes)) return err({ code: "looks_like_zip" });

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return err({ code: "not_letterboxd_ratings" });
  }
  if (text.trim() === "") return err({ code: "empty_file" });

  let header: string[] = [];
  let records: Record<string, string | undefined>[];
  try {
    records = parse(text, {
      bom: true,
      columns: (names: string[]) => {
        header = names.map((name) => name.trim().toLowerCase());
        return header;
      },
      skip_empty_lines: true,
      relax_column_count: true,
    });
  } catch {
    return err({ code: "not_letterboxd_ratings" });
  }

  if (!REQUIRED_COLUMNS.every((column) => header.includes(column))) {
    return err({ code: "not_letterboxd_ratings" });
  }
  if (records.length === 0) return err({ code: "empty_file" });

  return ok(
    records.map((record, index) => ({
      rowNumber: index + 1,
      name: record.name ?? "",
      year: record.year ?? "",
      rating: record.rating ?? "",
      date: record.date ?? "",
    })),
  );
}

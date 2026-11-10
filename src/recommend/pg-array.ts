/**
 * Formats numbers as a Postgres array literal, for one bound parameter cast
 * with `::bigint[]` or `::float8[]`. One parameter however long the list is.
 * Callers pass validated finite numbers only.
 */
export function pgArray(values: readonly number[]): string {
  return `{${values.join(",")}}`;
}

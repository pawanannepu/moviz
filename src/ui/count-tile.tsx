import type { ReactNode } from "react";

type CountTileProps = {
  label: string;
  value: number;
};

/**
 * One number with its name, on a Curtain surface (spec 0009, AC-2). Use it
 * inside `CountTiles`, which is the description list it belongs to. The number
 * is formatted the same on server and browser, so the page never mismatches.
 */
export function CountTile({ label, value }: CountTileProps) {
  return (
    <div
      data-slot="count-tile"
      className="flex min-w-0 flex-col gap-1 rounded-sheet bg-card p-4"
    >
      <dt className="type-small">{label}</dt>
      <dd className="type-section">{value.toLocaleString("en-US")}</dd>
    </div>
  );
}

/** A row of `CountTile`s, as a description list so a screen reader reads each pair together. */
export function CountTiles({ children }: { children: ReactNode }) {
  return (
    <dl data-slot="count-tiles" className="grid max-w-xl grid-cols-3 gap-3">
      {children}
    </dl>
  );
}

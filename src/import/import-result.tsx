import Link from "next/link";
import { HOME_PATH, ONBOARDING_PATH } from "@/auth/paths";
import { CountTile, CountTiles } from "@/ui/count-tile";
import { Button } from "@/ui/primitives/button";
import { EmptyState } from "@/ui/states/empty-state";
import type { LatestImport } from "./get-latest-import";
import {
  FAILED_RESULT_BODY,
  FAILED_RESULT_TITLE,
  NO_UNMATCHED_LINE,
} from "./messages";
import { UnmatchedList } from "./unmatched-list";

type ImportResultProps = {
  latest: LatestImport;
  /** `profiles.onboarded_at` is set. Decides where the next step goes. */
  onboarded: boolean;
  /** The `/design` page passes its own Server Action stand in. */
  loadMore?: React.ComponentProps<typeof UnmatchedList>["loadMore"];
};

/**
 * The latest saved import (spec 0009, AC-2, AC-8). A `failed` import shows only
 * the retry text. A completed one shows the three counts, one next step (yellow,
 * because it is the next step), and the rows that were left out. The next step is
 * "See your feed" once the user is onboarded and "Keep swiping" until then.
 */
export function ImportResult({
  latest,
  onboarded,
  loadMore,
}: ImportResultProps) {
  if (latest.status === "failed") {
    return <EmptyState title={FAILED_RESULT_TITLE} body={FAILED_RESULT_BODY} />;
  }

  const nothingMatched = latest.rowsMatched === 0;
  return (
    <section
      aria-labelledby="latest-import-title"
      data-slot="import-result"
      className="flex flex-col gap-6"
    >
      <h2 id="latest-import-title" className="type-section">
        Your latest import
      </h2>
      <CountTiles>
        <CountTile label="Rows read" value={latest.rowsTotal} />
        <CountTile label="Matched" value={latest.rowsMatched} />
        <CountTile label="Not matched" value={latest.rowsUnmatched} />
      </CountTiles>
      {nothingMatched ? (
        <p className="max-w-[62ch] text-muted-foreground">
          No rows matched a film in the catalog, so your picks did not change.
        </p>
      ) : null}
      <div>
        <Button asChild>
          <Link href={onboarded ? HOME_PATH : ONBOARDING_PATH}>
            {onboarded ? "See your feed" : "Keep swiping"}
          </Link>
        </Button>
      </div>
      {latest.rowsUnmatched === 0 ? (
        <p className="max-w-[62ch] text-muted-foreground">
          {NO_UNMATCHED_LINE}
        </p>
      ) : (
        <UnmatchedList
          // The list keeps its rows and cursor in state. A new import on the same
          // page (upload without a reload) must start a new list, not reuse the old.
          key={latest.id}
          importId={latest.id}
          total={latest.rowsUnmatched}
          initial={latest.firstPage}
          {...(loadMore ? { loadMore } : {})}
        />
      )}
    </section>
  );
}

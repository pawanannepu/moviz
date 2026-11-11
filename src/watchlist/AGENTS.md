# src/watchlist

The signed in user's saved movies and seen list. The protected page is `/lists`; movie detail pages share the same save and rating controls. The data model contract is in [spec 0002](../../docs/specs/0002-data-model/index.md), and the UI follows [design.md](../../design.md).

## Key files

| File                         | Owns                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `watchlist.ts`               | Add and remove saved movies, and page through saved and rated movies with opaque cursors |
| `actions.ts`                 | Authenticated, Zod validated Server Actions for saving, removing, and rating a movie     |
| `movie-list-actions.tsx`     | Shared client controls for watchlist state and half star ratings                         |
| `movie-list-card.tsx`        | Movie card used by each list                                                             |
| `src/app/(protected)/lists/` | Protected lists page and its loading and error states                                    |

## Conventions

- A movie is seen when it has a rating. There is no separate seen table. Scores are integers from 1 to 10, representing half star steps.
- List actions get the user id from the live session. They validate client input before calling data functions and return typed results.
- Data functions receive the database and user id explicitly. Writes lock the user and movie against concurrent ratings, watchlist changes, and imports.
- Saving a rating removes the same movie from the watchlist. Importing a rating does the same. Watchlist reads also filter rated movies.
- Both lists page independently, newest first, with the shared opaque cursor helpers.
- Rating content and movie identifiers do not go in logs or analytics.

_Drafted by /sync from the introducing change, worth a quick human pass._

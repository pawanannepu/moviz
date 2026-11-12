import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/auth/session";
import { db } from "@/db/client";
import { FeedHeader } from "@/feed/feed-header";
import { Button } from "@/ui/primitives/button";
import { EmptyState } from "@/ui/states/empty-state";
import { MovieListCard } from "@/watchlist/movie-list-card";
import { listSeenMovies, listWatchlist } from "@/watchlist/watchlist";

export const metadata: Metadata = {
  title: "Your lists · Moviz",
  robots: { index: false, follow: false },
};

const cursorFrom = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/** Both personal movie lists, each paged independently by its opaque cursor. */
export default async function ListsPage({ searchParams }: PageProps<"/lists">) {
  const { user } = await requireUser("/lists");
  const query = await searchParams;
  const watchlistCursor = cursorFrom(query.watchlistCursor);
  const seenCursor = cursorFrom(query.seenCursor);
  const [watchlist, seen] = await Promise.all([
    listWatchlist(db, { userId: user.id, cursor: watchlistCursor }),
    listSeenMovies(db, { userId: user.id, cursor: seenCursor }),
  ]);

  const failed = !watchlist.ok || !seen.ok;
  const watchlistHref =
    watchlist.ok && watchlist.value.nextCursor
      ? {
          pathname: "/lists",
          query: {
            ...(seenCursor ? { seenCursor } : {}),
            watchlistCursor: watchlist.value.nextCursor,
          },
        }
      : null;
  const seenHref =
    seen.ok && seen.value.nextCursor
      ? {
          pathname: "/lists",
          query: {
            ...(watchlistCursor ? { watchlistCursor } : {}),
            seenCursor: seen.value.nextCursor,
          },
        }
      : null;

  return (
    <>
      <FeedHeader />
      <div className="page-container flex flex-col gap-10 py-8">
        <header className="flex flex-col gap-3">
          <h1 className="type-headline">Your lists</h1>
          <p className="max-w-[62ch] text-muted-foreground">
            Save a movie for later, or rate it after watching. Your seen ratings
            help shape the picks in your feed.
          </p>
          <nav
            aria-label="Your movie lists"
            className="flex flex-wrap gap-3 pt-2"
          >
            <Button asChild variant="secondary">
              <a href="#watchlist">Watchlist</a>
            </Button>
            <Button asChild variant="secondary">
              <a href="#seen">Seen and rated</a>
            </Button>
          </nav>
        </header>

        {failed ? (
          <section
            role="alert"
            className="flex flex-col items-start gap-4 rounded-sheet bg-card p-8"
          >
            <h2 className="type-section">Your lists could not load</h2>
            <p className="max-w-[62ch] text-muted-foreground">
              Check your connection, then reload your lists.
            </p>
            <Button asChild variant="secondary">
              <Link href="/lists">Try again</Link>
            </Button>
          </section>
        ) : (
          <>
            <section
              id="watchlist"
              aria-labelledby="watchlist-heading"
              className="flex flex-col gap-5"
            >
              <div className="flex flex-wrap items-end justify-between gap-3 border-card border-b pb-3">
                <div>
                  <p className="text-small">For another night</p>
                  <h2
                    id="watchlist-heading"
                    tabIndex={-1}
                    className="type-section"
                  >
                    Watchlist
                  </h2>
                </div>
                <p className="text-muted-foreground">
                  {watchlist.value.items.length}{" "}
                  {watchlist.value.items.length === 1 ? "movie" : "movies"} on
                  this page
                </p>
              </div>
              {watchlist.value.items.length > 0 ? (
                <ul className="feed-grid">
                  {watchlist.value.items.map((movie) => (
                    <li key={movie.movieId}>
                      <MovieListCard movie={movie} kind="watchlist" />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="Your watchlist is waiting"
                  body="Open any movie to save it here. When you rate it, it moves to your seen list."
                  action={{ href: "/home", label: "Browse your picks" }}
                  titleAs="h3"
                />
              )}
              {watchlistHref ? (
                <div className="flex justify-center">
                  <Button asChild variant="secondary">
                    <Link href={watchlistHref}>Next page of saved movies</Link>
                  </Button>
                </div>
              ) : null}
            </section>

            <section
              id="seen"
              aria-labelledby="seen-heading"
              className="flex flex-col gap-5"
            >
              <div className="flex flex-wrap items-end justify-between gap-3 border-card border-b pb-3">
                <div>
                  <p className="text-small">Your ratings, remembered</p>
                  <h2 id="seen-heading" tabIndex={-1} className="type-section">
                    Seen and rated
                  </h2>
                </div>
                <p className="text-muted-foreground">
                  {seen.value.items.length}{" "}
                  {seen.value.items.length === 1 ? "movie" : "movies"} on this
                  page
                </p>
              </div>
              {seen.value.items.length > 0 ? (
                <ul className="feed-grid">
                  {seen.value.items.map((movie) => (
                    <li key={movie.movieId}>
                      <MovieListCard movie={movie} kind="seen" />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="Your seen list starts with a rating"
                  body="Rate movies you have watched to keep them here and help Moviz learn what you enjoy."
                  action={{ href: "/home", label: "Find a movie to rate" }}
                  titleAs="h3"
                />
              )}
              {seenHref ? (
                <div className="flex justify-center">
                  <Button asChild variant="secondary">
                    <Link href={seenHref}>Next page of seen movies</Link>
                  </Button>
                </div>
              ) : null}
            </section>
          </>
        )}
      </div>
    </>
  );
}

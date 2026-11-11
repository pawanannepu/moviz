import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { HOME_PATH } from "@/auth/paths";
import { getSession, requireUser } from "@/auth/session";
import { db } from "@/db/client";
import { FeedHeader } from "@/feed/feed-header";
import { BackToPicks } from "@/movie/back-to-picks";
import { NOT_FOUND_PAGE_TITLE, PLAIN_PAGE_TITLE } from "@/movie/constants";
import { moviePageTitle } from "@/movie/format";
import { MovieDetail } from "@/movie/movie-detail";
import { MovieDetailLoading } from "@/movie/movie-detail-skeleton";
import { moviePath, parseMovieId } from "@/movie/movie-path";
import { readMovie } from "@/movie/read-movie";

/**
 * The page title (spec 0010, AC-19). A route level `not-found.tsx` cannot set
 * a title, so this is the only source of it. It reads the cached session first
 * and makes no movie read without one, parses the id before any read, and
 * shares its one movie read with the page body. It never redirects, and a
 * failure of its own gives the plain title instead of an error.
 */
async function movieTitle(segment: string): Promise<string> {
  try {
    if (!(await getSession())) return PLAIN_PAGE_TITLE;
    const movieId = parseMovieId(segment);
    if (movieId === null) return NOT_FOUND_PAGE_TITLE;
    const movie = await readMovie(db, movieId);
    if (!movie.ok) {
      return movie.error.code === "movie_not_found"
        ? NOT_FOUND_PAGE_TITLE
        : PLAIN_PAGE_TITLE;
    }
    return movie.value.removed
      ? NOT_FOUND_PAGE_TITLE
      : moviePageTitle(movie.value);
  } catch (error) {
    // Lets Next.js keep its own signals; anything else gives the plain title.
    unstable_rethrow(error);
    return PLAIN_PAGE_TITLE;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/movie/[id]">): Promise<Metadata> {
  const { id } = await params;
  return {
    title: await movieTitle(id),
    robots: { index: false, follow: false },
  };
}

/**
 * One movie (spec 0010). The order of the guards is fixed (AC-2): parse the id
 * (pure, no read), then check the session, then answer a bad id with a real
 * 404. A visitor with a stale session therefore always goes to sign in first,
 * and no movie read ever runs for a bad id. Any signed in user may open the
 * page; there is no onboarding check (AC-1).
 *
 * The header, the back link and a loading state are sent at once; the movie
 * streams in behind the Suspense boundary (AC-10).
 */
export default async function MoviePage({ params }: PageProps<"/movie/[id]">) {
  const { id } = await params;
  const movieId = parseMovieId(id);
  const { user } = await requireUser(
    movieId === null ? HOME_PATH : moviePath(movieId),
  );
  if (movieId === null) notFound();

  return (
    <>
      <FeedHeader />
      <div className="page-container flex flex-col gap-6 pt-2 pb-12">
        <BackToPicks movieId={movieId} />
        <Suspense fallback={<MovieDetailLoading />}>
          <MovieDetail userId={user.id} movieId={movieId} />
        </Suspense>
      </div>
    </>
  );
}

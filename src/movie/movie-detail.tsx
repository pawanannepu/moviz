import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/db/client";
import { resolveCountry } from "@/watch/resolve-country";
import { WhereToWatch } from "@/watch/where-to-watch";
import { WhereToWatchSkeleton } from "@/watch/where-to-watch-view";
import { loadMoviePage } from "./load-movie-page";
import { MovieDetailView } from "./movie-detail-view";
import { MovieLoadError } from "./movie-load-error";

/**
 * The movie page's body (spec 0010). An async server component: it reads the
 * movie and its reason, then renders the movie, the not found page, or the in
 * page error. The page wraps it in Suspense, so the header, the back link and
 * a loading state go out first. The caller has already checked the user and
 * the id.
 *
 * The user's country for where to watch is resolved here, beside the movie
 * read and inside the page's Suspense, so it never delays the first byte
 * (spec 0013, AC-5). Where to watch then streams in behind its own boundary.
 */
export async function MovieDetail({
  userId,
  movieId,
}: {
  userId: string;
  movieId: number;
}) {
  const [page, country] = await Promise.all([
    loadMoviePage(db, { userId, movieId }),
    sectionCountry(userId),
  ]);
  if (!page.ok) {
    if (page.error.code === "movie_not_found") notFound();
    return <MovieLoadError />;
  }
  return (
    <MovieDetailView
      movie={page.value.movie}
      movieId={movieId}
      reason={page.value.reason}
      feedback={page.value.feedback}
      listState={{ watchlisted: false, score: null }}
      afterOverview={
        <Suspense fallback={<WhereToWatchSkeleton />}>
          <WhereToWatch movieId={movieId} country={country} />
        </Suspense>
      }
    />
  );
}

/** The country, or null when it cannot be read (the section then asks for one). */
async function sectionCountry(userId: string): Promise<string | null> {
  try {
    const ipCountry = (await headers()).get("x-vercel-ip-country");
    const result = await resolveCountry(db, { userId, ipCountry });
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}

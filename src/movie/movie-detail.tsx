import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { loadMoviePage } from "./load-movie-page";
import { MovieDetailView } from "./movie-detail-view";
import { MovieLoadError } from "./movie-load-error";

/**
 * The movie page's body (spec 0010). An async server component: it reads the
 * movie and its reason, then renders the movie, the not found page, or the in
 * page error. The page wraps it in Suspense, so the header, the back link and
 * a loading state go out first. The caller has already checked the user and
 * the id.
 */
export async function MovieDetail({
  userId,
  movieId,
}: {
  userId: string;
  movieId: number;
}) {
  const page = await loadMoviePage(db, { userId, movieId });
  if (!page.ok) {
    if (page.error.code === "movie_not_found") notFound();
    return <MovieLoadError />;
  }
  return (
    <MovieDetailView
      movie={page.value.movie}
      movieId={movieId}
      reason={page.value.reason}
      listState={{ watchlisted: false, score: null }}
    />
  );
}

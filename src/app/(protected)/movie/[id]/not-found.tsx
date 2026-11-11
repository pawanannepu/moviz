import { FeedHeader } from "@/feed/feed-header";
import { MovieNotFound } from "@/movie/movie-not-found";

/**
 * The not found page of `/movie/[id]` (spec 0010, AC-3). It replaces the whole
 * page, so it draws the header itself. The page title comes from the page's
 * `generateMetadata`, because this file cannot set one.
 */
export default function MovieNotFoundPage() {
  return (
    <>
      <FeedHeader />
      <div className="page-container flex flex-col gap-6 py-6">
        <MovieNotFound />
      </div>
    </>
  );
}

import { MovieDetailSkeleton } from "@/movie/movie-detail-skeleton";
import {
  type MovieDetailMovie,
  MovieDetailView,
} from "@/movie/movie-detail-view";
import { MovieNotFound } from "@/movie/movie-not-found";

/** Made up facts for the review page, used when the catalog cannot be read. */
export const SAMPLE_DETAIL: MovieDetailMovie = {
  title: "Collateral",
  releaseYear: 2004,
  runtimeMinutes: 120,
  genres: ["Crime", "Drama", "Thriller"],
  tagline: "It started like any other night.",
  overview:
    "A cab driver finds himself the hostage of an engaging contract killer as he makes his rounds from hit to hit during one night in Los Angeles.",
  posterPath: null,
  directors: [{ personId: 1, name: "Michael Mann", profilePath: null }],
  cast: [
    ["Tom Cruise", "Vincent"],
    ["Jamie Foxx", "Max"],
    ["Jada Pinkett Smith", "Annie"],
    ["Mark Ruffalo", "Fanning"],
    ["Peter Berg", "Richard Weidner"],
    ["Bruce McGill", "Pedrosa"],
    ["Irma P. Hall", "Ida"],
    ["Barry Shabaka Henley", "Daniel"],
    ["A ninth name that is never shown", "Extra"],
  ].map(([name, characterName], index) => ({
    personId: index + 1,
    name,
    profilePath: null,
    characterName,
  })),
};

const LONG_TITLE: MovieDetailMovie = {
  title:
    "The Incredibly Strange Creatures Who Stopped Living and Became Mixed-Up Zombies, a Supercalifragilisticexpialidocious Extended Cut",
  releaseYear: null,
  runtimeMinutes: null,
  genres: [],
  tagline: null,
  overview: "A movie with a very long title and almost nothing else on file.",
  posterPath: null,
  directors: [],
  cast: [
    { personId: 1, name: "Cash Flagg", profilePath: null, characterName: null },
  ],
};

function Case({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="type-small">{label}</p>
      {children}
    </div>
  );
}

/**
 * The movie detail view in every state on the `/design` page (spec 0010,
 * AC-20). Headings sit at level 3 here, under the page's own section headings.
 * The in page error is the shared error state with other words, shown under
 * States.
 */
export function MovieDetailDemo({ movie }: { movie: MovieDetailMovie }) {
  return (
    <div className="flex flex-col gap-12">
      <Case label="With a reason">
        <MovieDetailView
          movie={movie}
          reason="Because you loved Heat (1995)"
          headingLevel={3}
        />
      </Case>
      <Case label="Without a reason (a movie you rated or skipped)">
        <MovieDetailView movie={movie} reason={null} headingLevel={3} />
      </Case>
      <Case label="No poster">
        <MovieDetailView
          movie={{ ...movie, posterPath: null }}
          reason={null}
          headingLevel={3}
        />
      </Case>
      <Case label="A long title, and no year, runtime, genres, tagline or director">
        <MovieDetailView
          movie={LONG_TITLE}
          reason="Popular with film fans"
          headingLevel={3}
        />
      </Case>
      <Case label="Loading">
        <MovieDetailSkeleton />
      </Case>
      <Case label="Not found">
        <MovieNotFound headingLevel={3} />
      </Case>
    </div>
  );
}

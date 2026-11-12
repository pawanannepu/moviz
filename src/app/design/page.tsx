import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { MovieDetailMovie } from "@/movie/movie-detail-view";
import { biteReasonSentence } from "@/search/reason-sentence";
import { ErrorStateDemo } from "@/ui/design/error-state-demo";
import { ImportDemo } from "@/ui/design/import-demo";
import { isDesignPageHidden } from "@/ui/design/is-design-page-hidden";
import { LoadMoreDemo } from "@/ui/design/load-more-demo";
import { MovieDetailDemo, SAMPLE_DETAIL } from "@/ui/design/movie-detail-demo";
import { SwipeDemo } from "@/ui/design/swipe-demo";
import { ToastDemo } from "@/ui/design/toast-demo";
import { WatchlistDemo } from "@/ui/design/watchlist-demo";
import { WhereToWatchDemo } from "@/ui/design/where-to-watch-demo";
import { FeedItem } from "@/ui/feed-item";
import { Field } from "@/ui/field";
import { loadHeroPick } from "@/ui/landing/load-hero-pick";
import { MovieCard, type MovieCardMovie } from "@/ui/movie-card";
import { MovieCardSkeleton } from "@/ui/movie-card-skeleton";
import { Button } from "@/ui/primitives/button";
import { EmptyState } from "@/ui/states/empty-state";
import { LoadingState } from "@/ui/states/loading-state";
import { countryOptions } from "@/watch/regions";

export const metadata: Metadata = {
  title: "Design system · Moviz",
  robots: { index: false, follow: false },
};

const COLORS = [
  {
    name: "Pit",
    role: "Page background",
    swatch: "bg-pit",
    text: "text-screen",
  },
  {
    name: "Curtain",
    role: "Raised surfaces",
    swatch: "bg-curtain",
    text: "text-screen",
  },
  {
    name: "Screen",
    role: "Main text and focus ring",
    swatch: "bg-screen",
    text: "text-pit",
  },
  { name: "Dust", role: "Secondary text", swatch: "bg-dust", text: "text-pit" },
  {
    name: "Subtitle",
    role: "Reasons and the next step",
    swatch: "bg-subtitle",
    text: "text-pit",
  },
  { name: "Exit", role: "Errors only", swatch: "bg-exit", text: "text-pit" },
  {
    name: "Edge",
    role: "Borders of controls",
    swatch: "bg-edge",
    text: "text-pit",
  },
] as const;

/** A poster address that never loads, to show the fallback frame. */
const BROKEN_POSTER = "/moviz-review-missing-poster.jpg";

const LONG_REASON =
  "Because you rated Heat and Collateral highly, and gave patient, moody crime films with a strong sense of place your top marks every time, this one is the next to see.";

type ReviewMovie = MovieCardMovie;

/**
 * The movies the review page shows. The first is a real catalog movie when the
 * database is reachable. The rest are made up to show each case.
 */
async function loadReviewMovies(): Promise<ReviewMovie[]> {
  let real: ReviewMovie | null = null;
  try {
    const { db } = await import("@/db/client");
    const pick = await loadHeroPick(db);
    if (pick) real = { ...pick.movie, genres: ["Crime", "Thriller"] };
  } catch {
    real = null;
  }
  return [
    real ?? {
      id: 1,
      title: "Collateral",
      releaseYear: 2004,
      posterPath: BROKEN_POSTER,
      genres: ["Crime", "Thriller"],
    },
    {
      id: 2,
      title: "Heat",
      releaseYear: 1995,
      posterPath: null,
      genres: ["Crime", "Drama", "Action"],
    },
    {
      id: 3,
      title: "A film with no year or genres",
      releaseYear: null,
      posterPath: null,
      genres: [],
    },
    {
      id: 4,
      title: "Broken poster",
      releaseYear: 2001,
      posterPath: BROKEN_POSTER,
      genres: ["Drama"],
    },
  ];
}

/**
 * The movie the detail section shows: the full facts of the review page's real
 * movie when the database is reachable, else made up facts with its poster.
 */
async function loadReviewDetail(real: ReviewMovie): Promise<MovieDetailMovie> {
  try {
    const { db } = await import("@/db/client");
    const { getMovie } = await import("@/catalog/read/get-movie");
    const movie = await getMovie(db, real.id);
    if (movie.ok && !movie.value.removed) return movie.value;
  } catch {
    // Fall through to the made up facts.
  }
  return { ...SAMPLE_DETAIL, posterPath: real.posterPath };
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-6 border-t border-card pt-12"
    >
      <div className="flex flex-col gap-2">
        <h2 id={`${id}-title`} className="type-section">
          {title}
        </h2>
        {note ? <p className="type-small max-w-[62ch]">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The review page: every token and component in every state. Hidden when
 * `VERCEL_ENV` is `production` (spec 0004, AC-17). Rendered per request, so a
 * build never needs the environment.
 */
export default async function DesignPage() {
  await connection();
  const { env } = await import("@/env");
  if (isDesignPageHidden(env.VERCEL_ENV)) notFound();

  const [first, second, third, fourth] = await loadReviewMovies();
  const detail = await loadReviewDetail(first);
  const cards = [
    { key: "plain", movie: first, href: undefined },
    { key: "link", movie: { ...first, id: 5 }, href: "/design" },
    { key: "no-poster", movie: second, href: undefined },
    { key: "broken", movie: fourth, href: undefined },
  ];
  const feedItems = [
    { key: "short", movie: first, reason: "Because you rated Heat highly." },
    {
      key: "long",
      movie: { ...third, posterPath: null, title: "Long reason" },
      reason: LONG_REASON,
    },
    {
      key: "no-poster",
      movie: second,
      reason: "Because you liked Collateral.",
    },
  ];

  return (
    <div className="page-container flex flex-col gap-12 pt-8 pb-16">
      <header className="flex flex-col gap-4">
        <h1 className="type-headline">The subtitle line</h1>
        <p className="max-w-[62ch] text-lg text-muted-foreground">
          Every Moviz token and component, in every state. This page is for
          review and is hidden in production.
        </p>
      </header>

      <Section
        id="color"
        title="Color"
        note="Seven colors, dark only. Yellow marks a reason or the next step. Red marks an error."
      >
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {COLORS.map((color) => (
            <li
              key={color.name}
              className="flex flex-col gap-2 rounded-sheet border border-border p-2"
            >
              <div
                className={`${color.swatch} ${color.text} flex aspect-square items-end rounded-poster p-2 font-medium`}
              >
                {color.name}
              </div>
              <p className="type-small">{color.role}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="type"
        title="Type"
        note="Archivo for the wordmark and headlines, Atkinson Hyperlegible Next for the rest."
      >
        <div className="flex flex-col gap-6">
          <p className="type-wordmark">Moviz</p>
          <p className="type-headline">Picks that say why.</p>
          <p className="type-section">Section title</p>
          <p className="type-title">Movie title</p>
          <p className="max-w-[62ch]">
            Body text. Swipe a few movies you know. Every pick Moviz makes comes
            with its reason.
          </p>
          <p className="type-reason">Because you rated Heat highly.</p>
          <p className="type-small">Small text for meta lines and hints.</p>
        </div>
      </Section>

      <Section
        id="buttons"
        title="Buttons"
        note="Four variants, three sizes. Every size is at least 44px high."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="large">Large</Button>
            <Button>Default</Button>
            <Button size="icon" variant="secondary" aria-label="Icon button">
              +
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled>Primary disabled</Button>
            <Button variant="secondary" disabled>
              Secondary disabled
            </Button>
          </div>
        </div>
      </Section>

      <Section
        id="fields"
        title="Fields"
        note="A label, an input, and optional hint and error text linked with aria-describedby."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Email"
            name="email-default"
            type="email"
            placeholder="you@example.com"
          />
          <Field
            label="Email with a hint"
            name="email-hint"
            type="email"
            hint="We only use it to sign you in."
          />
          <Field
            label="Email with an error"
            name="email-error"
            type="email"
            defaultValue="not an email"
            error="Enter an email like you@example.com."
          />
          <Field
            label="Email disabled"
            name="email-disabled"
            type="email"
            disabled
            defaultValue="you@example.com"
          />
        </div>
      </Section>

      <Section
        id="movie-card"
        title="Movie card"
        note="The poster is the card. Left to right: a plain card, a card that links, a movie with no poster, and a poster that fails to load."
      >
        <ul className="feed-grid">
          {cards.map((card) => (
            <li key={card.key}>
              <MovieCard movie={card.movie} href={card.href} />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="feed-item"
        title="Feed item"
        note="A movie card with its reason set as a subtitle on the poster. The reason is never cut off, even at 200 characters. The bar wipes in once as an item scrolls into view."
      >
        <ul className="feed-grid">
          {feedItems.map((item) => (
            <li key={item.key}>
              <FeedItem movie={item.movie} reason={item.reason} />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="bite-search"
        title="Bite search card"
        note="A search result is a feed item with the search reason: close to a liked movie, the phrase alone, and the words mode reason. A long phrase is cut to 40 characters. Search cards carry no feedback buttons."
      >
        <ul className="feed-grid">
          {[
            {
              movie: first,
              reason: biteReasonSentence({
                kind: "bite_vibe",
                phrase: "a slow moody thriller from the 90s",
                anchor: { movieId: 0, title: "Heat", releaseYear: 1995 },
              }),
            },
            {
              movie: second,
              reason: biteReasonSentence({
                kind: "bite_vibe",
                phrase: "something short and funny tonight",
                anchor: null,
              }),
            },
            {
              movie: third,
              reason: biteReasonSentence({
                kind: "bite_words",
                phrase:
                  "a feel good classic for a rainy Sunday with the whole family",
              }),
            },
          ].map((item) => (
            <li key={item.movie.id}>
              <FeedItem movie={item.movie} reason={item.reason} />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="skeleton"
        title="Skeleton"
        note="Static placeholders. Nothing pulses."
      >
        <ul className="feed-grid">
          {[0, 1].map((slot) => (
            <li key={slot}>
              <MovieCardSkeleton />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="swipe-card"
        title="Swipe card"
        note="Drag the poster right to like, left to dislike, up for not seen. Or press a button. Or focus the card and use the arrow keys. A pretend save takes about half a second."
      >
        <SwipeDemo movies={[first, second, third, fourth]} />
      </Section>

      <Section id="states" title="States" note="Empty, error and loading.">
        <div className="flex flex-col gap-6">
          <EmptyState
            title="No picks yet"
            body="There are no movies to suggest right now. Check back soon."
          />
          <ErrorStateDemo />
          <LoadingState label="Loading your picks" />
        </div>
      </Section>

      <Section
        id="load-more"
        title="Load more bar"
        note="Under the feed grid. One button covers ready, loading and failed. A lost session shows a sign in link, and the end of the feed shows a line."
      >
        <LoadMoreDemo />
      </Section>

      <Section
        id="movie-detail"
        title="Movie detail"
        note="One movie in full. One column with a poster up to 420px wide, then two columns from 1024px. The reason sits on the poster in full, with no motion. A fact that is missing is left out."
      >
        <MovieDetailDemo movie={detail} />
      </Section>

      <Section
        id="where-to-watch"
        title="Where to watch"
        note="On the movie page, after the synopsis. Services grouped as Stream, Free, Rent and Buy, each name as text beside its logo, with the JustWatch credit. Save on this page never stores anything."
      >
        <WhereToWatchDemo options={countryOptions()} />
      </Section>

      <Section
        id="watchlist"
        title="Watchlist and seen list"
        note="Save a movie for later, remove it, or give it a half star rating to mark it seen."
      >
        <WatchlistDemo />
      </Section>

      <Section
        id="import"
        title="Letterboxd import"
        note="The file field, the count tiles, the upload form in every state, and the latest result. Nothing is sent from this page."
      >
        <ImportDemo />
      </Section>

      <Section
        id="toasts"
        title="Toasts"
        note="Bottom center, with a close button."
      >
        <ToastDemo />
      </Section>
    </div>
  );
}

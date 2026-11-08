import Link from "next/link";
import { POSTER_DIMENSIONS, posterUrl } from "@/catalog/images";
import { PosterImage } from "@/ui/poster-image";
import { Button } from "@/ui/primitives/button";
import { SubtitleBar } from "@/ui/subtitle-bar";
import { type HeroPick, SAMPLE_REASON } from "./hero-picks";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "./paths";

/**
 * The signed out landing page, first viewport (spec 0004, AC-15). The Moviz
 * wordmark at hero size, one headline, one line, two buttons, and one big
 * poster with its reason set as a subtitle. DOM order and visual order match:
 * wordmark, headline, line, buttons, poster. From 1024px the text sits left and
 * the poster right. With no pick (an empty or unreachable catalog) it shows an
 * empty poster frame that still carries the sample reason.
 */
export function Hero({ pick }: { pick: HeroPick | null }) {
  const reason = pick?.reason ?? SAMPLE_REASON;
  const { width, height } = POSTER_DIMENSIONS.w500;

  return (
    <div className="page-container grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center lg:gap-16 lg:py-16">
      <div className="flex flex-col items-start gap-6">
        <p className="type-wordmark">Moviz</p>
        <h1 className="type-headline">Picks that say why.</h1>
        <p className="max-w-[62ch] text-lg">
          Swipe a few movies you know. Every pick Moviz makes comes with its
          reason.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="large">
            <Link href={SIGN_UP_PATH}>Start swiping</Link>
          </Button>
          <Button asChild size="large" variant="ghost">
            <Link href={SIGN_IN_PATH}>Sign in</Link>
          </Button>
        </div>
      </div>

      <figure className="w-full max-w-105">
        <div className="relative aspect-2/3 overflow-hidden rounded-poster bg-card">
          {pick ? (
            <PosterImage
              src={posterUrl(pick.movie.posterPath, "w500")}
              alt={`Poster for ${pick.movie.title}`}
              width={width}
              height={height}
              title={pick.movie.title}
              priority
            />
          ) : null}
          <SubtitleBar>
            <span className="sr-only">Example pick: </span>
            {reason}
          </SubtitleBar>
        </div>
        {pick ? (
          <figcaption className="mt-3 flex flex-wrap items-baseline gap-x-2">
            <span className="type-title">{pick.movie.title}</span>
            {pick.movie.releaseYear === null ? null : (
              <span className="type-small">{pick.movie.releaseYear}</span>
            )}
          </figcaption>
        ) : null}
      </figure>
    </div>
  );
}

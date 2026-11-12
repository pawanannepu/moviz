import { PROVIDER_LOGO_SIZE, providerLogoUrl } from "@/catalog/images";
import { Skeleton } from "@/ui/primitives/skeleton";
import type { SetCountryResult } from "./actions";
import {
  inCountry,
  JUSTWATCH_CREDIT_PREFIX,
  JUSTWATCH_NAME,
  JUSTWATCH_URL,
  NO_COUNTRY_LINE,
  notFoundOnStreaming,
  TMDB_LINK_LABEL,
  UNAVAILABLE_LINE,
  WHERE_TO_WATCH_TITLE,
} from "./constants";
import { CountryPicker } from "./country-picker";
import type { OfferGroup } from "./offers";
import { type CountryOption, countryName } from "./regions";

/** What the section shows (spec 0013, state transitions). */
export type WhereToWatchState =
  | {
      kind: "offers";
      country: string;
      groups: OfferGroup[];
      link: string | null;
    }
  | { kind: "empty"; country: string }
  | { kind: "no_country" }
  | { kind: "unavailable"; country: string };

type HeadingLevel = 2 | 4;

type WhereToWatchViewProps = {
  state: WhereToWatchState;
  options: CountryOption[];
  /** 2 on the movie page (groups at 3), 4 on `/design` (groups at 5). */
  headingLevel?: HeadingLevel;
  /** Keeps ids unique when the `/design` page shows several sections. */
  idPrefix?: string;
  /** Replaceable for the `/design` page. */
  save?: (input: { country: string }) => Promise<SetCountryResult>;
};

const linkClass = "underline";

function JustWatchCredit() {
  return (
    <p
      data-slot="justwatch-credit"
      className="type-small text-muted-foreground"
    >
      {JUSTWATCH_CREDIT_PREFIX}{" "}
      <a href={JUSTWATCH_URL} className={`${linkClass} text-foreground`}>
        {JUSTWATCH_NAME}
      </a>
    </p>
  );
}

function OfferList({
  group,
  id,
  Heading,
}: {
  group: OfferGroup;
  id: string;
  Heading: "h3" | "h5";
}) {
  return (
    <div className="flex flex-col gap-2">
      <Heading id={id} className="type-small text-muted-foreground">
        {group.label}
      </Heading>
      <ul aria-labelledby={id} className="flex flex-wrap gap-x-4 gap-y-3">
        {group.offers.map((offer) => {
          const logo = providerLogoUrl(offer.logoPath);
          return (
            <li
              key={offer.providerId}
              className="flex min-w-0 items-center gap-2"
            >
              {logo ? (
                // A plain image: the logo is small, hotlinked and decorative.
                // biome-ignore lint/performance/noImgElement: hotlinked TMDB logo, served as is
                <img
                  src={logo}
                  alt=""
                  width={PROVIDER_LOGO_SIZE}
                  height={PROVIDER_LOGO_SIZE}
                  loading="lazy"
                  className="size-8 shrink-0 rounded-control"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="size-8 shrink-0 rounded-control bg-card"
                />
              )}
              <span className="wrap-break-word">{offer.name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The "Where to watch" section in one of its states (spec 0013, AC-1 to AC-6,
 * AC-8, AC-12). Every state that shows TMDB data, the empty state too, carries
 * the JustWatch credit; the unavailable state shows none. Each group is a list
 * labelled by its own heading, and each service shows its name as text beside
 * a logo with an empty alt. The country line and the picker sit in the same
 * place in every state, so the picker keeps its state across the refresh.
 */
export function WhereToWatchView({
  state,
  options,
  headingLevel = 2,
  idPrefix = "where-to-watch",
  save,
}: WhereToWatchViewProps) {
  const Heading = headingLevel === 2 ? "h2" : "h4";
  const GroupHeading = headingLevel === 2 ? "h3" : "h5";
  const headingId = `${idPrefix}-heading`;
  const lineId = `${idPrefix}-country`;
  const country = state.kind === "no_country" ? null : state.country;

  return (
    <section
      data-slot="where-to-watch"
      data-state={state.kind}
      aria-labelledby={headingId}
      className="flex max-w-[62ch] flex-col gap-4 border-card border-t pt-5"
    >
      <Heading id={headingId} className="type-section">
        {WHERE_TO_WATCH_TITLE}
      </Heading>
      <div className="flex flex-col items-start gap-3">
        <p id={lineId} tabIndex={-1} className="text-muted-foreground">
          {country === null ? NO_COUNTRY_LINE : inCountry(countryName(country))}
        </p>
        <CountryPicker
          current={country}
          options={options}
          focusTargetId={lineId}
          save={save}
        />
      </div>

      {state.kind === "offers" ? (
        <>
          {state.groups.map((group) => (
            <OfferList
              key={group.key}
              group={group}
              id={`${idPrefix}-${group.key}`}
              Heading={GroupHeading}
            />
          ))}
          {state.link ? (
            <p>
              <a
                href={state.link}
                className={`${linkClass} inline-flex min-h-11 items-center`}
              >
                {TMDB_LINK_LABEL}
              </a>
            </p>
          ) : null}
          <JustWatchCredit />
        </>
      ) : null}

      {state.kind === "empty" ? (
        <>
          <p>{notFoundOnStreaming(countryName(state.country))}</p>
          <JustWatchCredit />
        </>
      ) : null}

      {state.kind === "unavailable" ? <p>{UNAVAILABLE_LINE}</p> : null}
    </section>
  );
}

/**
 * The section while it loads (AC-1): the real heading, then static blocks
 * hidden from screen readers. Nothing pulses.
 */
export function WhereToWatchSkeleton({
  headingLevel = 2,
}: {
  headingLevel?: HeadingLevel;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h4";
  return (
    <section
      data-slot="where-to-watch-skeleton"
      aria-busy="true"
      className="flex max-w-[62ch] flex-col gap-4 border-card border-t pt-5"
    >
      <Heading className="type-section">{WHERE_TO_WATCH_TITLE}</Heading>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <Skeleton className="h-5 w-1/3" />
        <div className="flex flex-wrap gap-4">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
    </section>
  );
}

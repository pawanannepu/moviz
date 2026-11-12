import { TERMS_VERSION } from "@/auth/terms";
import { Bullets, ContactEmail, type LegalSection } from "./legal-document";
import { formatLegalDate } from "./operator";

export const TERMS_TITLE = "Terms of use";

export const TERMS_LEAD = (
  <p>
    The rules for using Moviz. By creating an account you agree to them, and to
    how the privacy policy says we handle your data.
  </p>
);

/** The terms sections, in order (spec 0014, AC-3). */
export const TERMS_SECTIONS: readonly LegalSection[] = [
  {
    id: "what-moviz-is",
    title: "What Moviz is",
    body: (
      <p>
        Moviz recommends movies from your ratings and says why it chose each
        one. It is free. There are no paid plans and no ads.
      </p>
    ),
  },
  {
    id: "your-account",
    title: "Your account",
    body: (
      <Bullets>
        <li>One account per person, with an email address you control.</li>
        <li>
          Keep your password to yourself. You are responsible for what happens
          under your account.
        </li>
        <li>
          If you think someone else has used your account, reset your password
          and tell us.
        </li>
      </Bullets>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>Please do not:</p>
        <Bullets>
          <li>scrape or copy the catalog or the recommendations in bulk;</li>
          <li>create accounts with scripts or bots;</li>
          <li>
            flood the search or the import with requests, or try to get around
            their limits;
          </li>
          <li>
            try to reach other people's data, or disrupt the service for anyone
            else.
          </li>
        </Bullets>
        <p>We may suspend an account that does any of these.</p>
      </>
    ),
  },
  {
    id: "movie-data",
    title: "Movie data and recommendations",
    body: (
      <>
        <p>
          Movie details and images come from TMDB. Streaming availability comes
          from JustWatch, through TMDB. This product uses the TMDB API but is
          not endorsed or certified by TMDB.
        </p>
        <p>
          Recommendations are suggestions. We do not guarantee you will like a
          pick, or that the movie and streaming details are complete or current.
        </p>
      </>
    ),
  },
  {
    id: "as-is",
    title: "The service as it is",
    body: (
      <p>
        Moviz is provided as it is, without warranties. Features can change, and
        the service can pause or stop. As far as the law allows, we are not
        liable for losses from using it. Nothing here limits rights the law
        gives you that cannot be limited.
      </p>
    ),
  },
  {
    id: "ending-your-account",
    title: "Ending your account",
    body: (
      <>
        <p>
          You can delete your account at any time from your Account page. Your
          data goes with it, as the privacy policy describes.
        </p>
        <p>
          We can close an account that breaks these terms, or if we stop running
          Moviz. Where we can, we will tell you first.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        These are version{" "}
        <time dateTime={TERMS_VERSION}>{formatLegalDate(TERMS_VERSION)}</time>{" "}
        of the terms. When they change, the version and date change, and we will
        tell you about meaningful changes before they apply.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about these terms? Write to <ContactEmail />.
      </p>
    ),
  },
];

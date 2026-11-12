import {
  EXPIRED_AUTH_KEEP_DAYS,
  RATE_LIMIT_KEEP_DAYS,
  SEARCH_USAGE_KEEP_DAYS,
} from "@/user-data/purge-old-rows";
import {
  Bullets,
  ContactEmail,
  LegalDetail,
  type LegalSection,
} from "./legal-document";
import { BACKUP_RETENTION_DAYS, OPERATOR_NAME } from "./operator";
import { IMAGE_HOST, PROCESSORS } from "./processors";

const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

/** The backup window in words, or the placeholder text. */
function BackupWindow() {
  return BACKUP_RETENTION_DAYS === null ? (
    <LegalDetail name="BACKUP_RETENTION_DAYS" value="" />
  ) : (
    days(BACKUP_RETENTION_DAYS)
  );
}

export const PRIVACY_TITLE = "Privacy policy";

export const PRIVACY_LEAD = (
  <p>
    What Moviz collects, why, who else handles it, how long it stays, and what
    you can do about it. In plain words.
  </p>
);

/**
 * The privacy policy sections, in order (spec 0014, AC-2). The operator
 * details, processors and retention periods come from their constants, so the
 * text cannot drift from the code.
 */
export const PRIVACY_SECTIONS: readonly LegalSection[] = [
  {
    id: "who-runs-moviz",
    title: "Who runs Moviz",
    body: (
      <>
        <p>
          Moviz is run by{" "}
          <LegalDetail name="OPERATOR_NAME" value={OPERATOR_NAME} />, who
          decides how your data is used (the data controller).
        </p>
        <p>
          For anything about your data, write to <ContactEmail />.
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        <p>Only what the service needs to work:</p>
        <Bullets>
          <li>
            <strong>Your account</strong>: your email address, a display name
            made from it, and a hash of your password (never the password
            itself).
          </li>
          <li>
            <strong>Your taste</strong>: the movies you rate and swipe, the ones
            you skip, your watchlist, and your feedback on picks (such as "Not
            interested" and "More like this").
          </li>
          <li>
            <strong>Your imports</strong>: the ratings you import from
            Letterboxd, and the rows we could not match to a movie.
          </li>
          <li>
            <strong>Your country</strong>: used to show where a movie is
            streaming, and how it was set (guessed from your IP address, or
            chosen by you).
          </li>
          <li>
            <strong>Search counts</strong>: how many searches you ran each day,
            so we can keep search within its daily limit.
          </li>
          <li>
            <strong>Sessions</strong>: one record per signed in device, with its
            IP address and browser user agent.
          </li>
          <li>
            <strong>Email checks</strong>: short lived records for email
            verification and password reset links, which hold your email
            address.
          </li>
          <li>
            <strong>Rate limit records</strong>: counts of recent requests per
            IP address, which stop password guessing and spam.
          </li>
        </Bullets>
      </>
    ),
  },
  {
    id: "why-we-use-it",
    title: "Why we use it",
    body: (
      <Bullets>
        <li>
          <strong>To provide the service</strong> you sign up for (the legal
          basis is our contract with you): your account, your taste data, your
          lists, imports, country and search counts power your picks and their
          reasons.
        </li>
        <li>
          <strong>To keep Moviz secure</strong> (the legal basis is our
          legitimate interest in protecting accounts and the service): sessions,
          the bot check, and rate limit records.
        </li>
      </Bullets>
    ),
  },
  {
    id: "who-else-handles-it",
    title: "Who else handles it",
    body: (
      <>
        <p>
          These services process data for us, under their own data processing
          terms. Each receives only what it needs:
        </p>
        <dl className="flex flex-col gap-4">
          {[...PROCESSORS, IMAGE_HOST].map((processor) => (
            <div
              key={processor.name}
              className="flex flex-col gap-1 rounded-control bg-card p-4"
            >
              <dt className="type-title">
                {processor.name}{" "}
                <span className="font-normal text-muted-foreground">
                  · {processor.purpose}
                </span>
              </dt>
              <dd>{processor.receives}</dd>
            </div>
          ))}
        </dl>
        <p>
          TMDB (the movie database) and JustWatch (the streaming data, through
          TMDB) never receive your account or taste data. We never sell your
          data, and there are no advertising or analytics services.
        </p>
      </>
    ),
  },
  {
    id: "how-long-we-keep-it",
    title: "How long we keep it",
    body: (
      <Bullets>
        <li>Account and taste data: until you delete your account.</li>
        <li>Search counts: {days(SEARCH_USAGE_KEEP_DAYS)}.</li>
        <li>Rate limit records: {days(RATE_LIMIT_KEEP_DAYS)}.</li>
        <li>
          Sessions and email check records: {days(EXPIRED_AUTH_KEEP_DAYS)} after
          they expire.
        </li>
        <li>
          Database backups: deleted data can stay in backups for up to{" "}
          <BackupWindow /> after you delete it, then it is gone for good.
        </li>
        <li>
          Server logs hold your user id (never your email or ratings) for the
          hosting provider's log retention period.
        </li>
      </Bullets>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <>
        <p>Moviz uses only what it needs to work:</p>
        <Bullets>
          <li>The sign in session cookie, which keeps you signed in.</li>
          <li>
            The Cloudflare Turnstile check on the sign up and reset pages, which
            tells people from bots.
          </li>
        </Bullets>
        <p>
          There are no analytics or advertising cookies, so there is no cookie
          banner.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights",
    body: (
      <>
        <Bullets>
          <li>
            <strong>See your data</strong>: download everything we hold about
            you from your Account page, as one file.
          </li>
          <li>
            <strong>Delete your data</strong>: delete your account from your
            Account page. Every rating, list, import, piece of feedback and
            search count goes with it.
          </li>
          <li>
            <strong>Correct your data</strong>: change your country on your
            Account page.
          </li>
          <li>
            <strong>Anything else</strong>, such as objecting to or limiting how
            we use your data: write to <ContactEmail />.
          </li>
        </Bullets>
        <p>
          You can also complain to the data protection authority where you live.
        </p>
      </>
    ),
  },
  {
    id: "international-transfers",
    title: "International transfers",
    body: (
      <p>
        The services above may store or process your data outside your country,
        including in the United States. Where that happens, they rely on the
        safeguards data protection law asks for, such as the European
        Commission's standard contractual clauses.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        Moviz is not meant for people under 16. If you think a child has made an
        account, write to <ContactEmail /> and we will delete it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        When this policy changes, the date at the top changes too. If a change
        affects how we use your data in a meaningful way, we will tell you by
        email first.
      </p>
    ),
  },
];

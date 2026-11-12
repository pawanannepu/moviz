/** A service that handles personal data on Moviz's behalf (spec 0014, AC-2). */
export type Processor = {
  name: string;
  /** What Moviz uses it for. */
  purpose: string;
  /** What it receives, in plain words. */
  receives: string;
};

/** Every processor the privacy policy lists, in the order it lists them. */
export const PROCESSORS: readonly Processor[] = [
  {
    name: "Neon",
    purpose: "Database hosting",
    receives:
      "Everything stored about your account: your email, name, password hash, ratings, lists, imports, feedback, country, search counts, sessions and rate limit records.",
  },
  {
    name: "Vercel",
    purpose: "Website hosting, and the country guess from your IP address",
    receives:
      "Every request your browser sends, including your IP address and browser user agent, and the server logs, which hold your user id but never your email or ratings.",
  },
  {
    name: "Resend",
    purpose: "Sending email",
    receives:
      "Your email address and the content of the emails we send you (the verification and password reset links).",
  },
  {
    name: "Voyage AI",
    purpose: "Understanding search phrases",
    receives:
      "The words you type into search, with no account details attached.",
  },
  {
    name: "Cloudflare Turnstile",
    purpose: "Checking that a sign up or reset request comes from a person",
    receives:
      "Signals from your browser and your IP address, during sign up and password reset only.",
  },
];

/**
 * TMDB is not a processor (Moviz sends it nothing about you), but your browser
 * loads posters and service logos straight from its image servers.
 */
export const IMAGE_HOST: Processor = {
  name: "TMDB",
  purpose: "Movie posters and streaming service logos",
  receives:
    "Your IP address and browser user agent, because your browser loads the images directly from TMDB's image servers.",
};

// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TERMS_VERSION } from "@/auth/terms";
import { axeViolations } from "@/test-support/axe";
import {
  EXPIRED_AUTH_KEEP_DAYS,
  RATE_LIMIT_KEEP_DAYS,
  SEARCH_USAGE_KEEP_DAYS,
} from "@/user-data/purge-old-rows";
import { LegalDocument } from "./legal-document";
import {
  BACKUP_RETENTION_DAYS,
  CONTACT_EMAIL,
  LEGAL_UPDATED_ON,
  OPERATOR_NAME,
} from "./operator";
import {
  PRIVACY_LEAD,
  PRIVACY_SECTIONS,
  PRIVACY_TITLE,
} from "./privacy-policy";
import { IMAGE_HOST, PROCESSORS } from "./processors";
import { TERMS_LEAD, TERMS_SECTIONS, TERMS_TITLE } from "./terms-of-use";

// Spec 0014: the privacy policy and the terms (AC-1, AC-2, AC-3, AC-12, AC-13).

afterEach(cleanup);

const renderPrivacy = () =>
  render(
    <LegalDocument
      title={PRIVACY_TITLE}
      lead={PRIVACY_LEAD}
      sections={PRIVACY_SECTIONS}
    />,
  );

const renderTerms = () =>
  render(
    <LegalDocument
      title={TERMS_TITLE}
      lead={TERMS_LEAD}
      sections={TERMS_SECTIONS}
    />,
  );

const sectionText = (id: string) =>
  document.getElementById(id)?.textContent ?? "";

const h2Texts = () =>
  within(screen.getByRole("article"))
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent);

describe("LegalDocument (AC-1)", () => {
  it("has exactly one h1 and the Last updated date from LEGAL_UPDATED_ON", () => {
    renderPrivacy();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Privacy policy",
    );
    const time = screen.getByText("12 November 2026");
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("datetime")).toBe(LEGAL_UPDATED_ON);
  });

  it("lists every section in the On this page nav, each linking to its heading", () => {
    renderPrivacy();
    const nav = screen.getByRole("navigation", { name: "On this page" });
    const links = within(nav).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual(
      PRIVACY_SECTIONS.map((section) => section.title),
    );
    for (const section of PRIVACY_SECTIONS) {
      const link = within(nav).getByRole("link", { name: section.title });
      expect(link.getAttribute("href")).toBe(`#${section.id}`);
      expect(document.getElementById(section.id)).not.toBeNull();
    }
  });

  it("names each section region by its heading", () => {
    renderTerms();

    for (const section of TERMS_SECTIONS) {
      expect(screen.getByRole("region", { name: section.title })).toBeTruthy();
    }
  });

  it("has no accessibility violations on either page", async () => {
    const privacy = renderPrivacy();
    expect(await axeViolations(privacy.container)).toEqual([]);
    cleanup();

    const terms = renderTerms();
    expect(await axeViolations(terms.container)).toEqual([]);
  });
});

describe("the privacy policy (AC-2)", () => {
  it("has its sections in the spec's order", () => {
    renderPrivacy();

    expect(h2Texts()).toEqual([
      "Who runs Moviz",
      "What we collect",
      "Why we use it",
      "Who else handles it",
      "How long we keep it",
      "Cookies",
      "Your rights",
      "International transfers",
      "Children",
      "Changes to this policy",
    ]);
  });

  it("names every processor and TMDB as the image host, each with what it receives", () => {
    renderPrivacy();
    const terms = screen
      .getAllByRole("term")
      .map((term) => term.textContent ?? "");

    for (const processor of [...PROCESSORS, IMAGE_HOST]) {
      expect(terms.some((text) => text.startsWith(processor.name))).toBe(true);
      expect(sectionText("who-else-handles-it")).toContain(processor.receives);
    }
    expect(PROCESSORS.map((processor) => processor.name)).toEqual([
      "Neon",
      "Vercel",
      "Resend",
      "Voyage AI",
      "Cloudflare Turnstile",
    ]);
  });

  it("says TMDB and JustWatch never receive account or taste data", () => {
    renderPrivacy();

    expect(sectionText("who-else-handles-it")).toContain(
      "TMDB (the movie database) and JustWatch (the streaming data, through TMDB) never receive your account or taste data.",
    );
  });

  it("covers each kind of data the spec lists", () => {
    renderPrivacy();
    const text = sectionText("what-we-collect");

    for (const item of [
      "email address",
      "hash of your password",
      "rate and swipe",
      "skip",
      "watchlist",
      "feedback",
      "Letterboxd",
      "could not match",
      "country",
      "how it was set",
      "searches",
      "IP address and browser user agent",
      "verification and password reset",
      "Rate limit records",
    ]) {
      expect(text).toContain(item);
    }
  });

  it("gives the legal basis for each use", () => {
    renderPrivacy();
    const text = sectionText("why-we-use-it");

    expect(text).toContain("contract with you");
    expect(text).toContain("legitimate interest");
  });

  it("reads its retention periods from the purge constants (AC-13)", () => {
    renderPrivacy();
    const text = sectionText("how-long-we-keep-it");
    const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

    expect(text).toContain(`Search counts: ${days(SEARCH_USAGE_KEEP_DAYS)}.`);
    expect(text).toContain(
      `Rate limit records: ${days(RATE_LIMIT_KEEP_DAYS)}.`,
    );
    expect(text).toContain(`${days(EXPIRED_AUTH_KEEP_DAYS)} after they expire`);
    expect(text).toContain("until you delete your account");
  });

  it("says there are no analytics cookies and so no cookie banner", () => {
    renderPrivacy();

    expect(sectionText("cookies")).toContain(
      "There are no analytics or advertising cookies, so there is no cookie banner.",
    );
  });

  it("covers access, erasure, correction, contact and a complaint", () => {
    renderPrivacy();
    const text = sectionText("your-rights");

    for (const item of [
      "download everything",
      "delete your account",
      "change your country",
      "Anything else",
      "data protection authority",
    ]) {
      expect(text).toContain(item);
    }
  });

  it("says Moviz is not meant for people under 16", () => {
    renderPrivacy();

    expect(sectionText("children")).toContain("not meant for people under 16");
  });
});

describe("configured legal details (AC-12)", () => {
  it("shows the configured details, never the raw constant names", () => {
    renderPrivacy();
    const text = document.body.textContent ?? "";

    expect(sectionText("who-runs-moviz")).toContain(OPERATOR_NAME);
    expect(sectionText("how-long-we-keep-it")).toContain(
      `up to ${BACKUP_RETENTION_DAYS} days after`,
    );
    expect(text).not.toContain("OPERATOR_NAME");
    expect(text).not.toContain("CONTACT_EMAIL");
    expect(text).not.toContain("BACKUP_RETENTION_DAYS");
  });

  it("links to the configured contact email", () => {
    renderPrivacy();

    expect(
      document.querySelector('a[href^="mailto:"]')?.getAttribute("href"),
    ).toBe(`mailto:${CONTACT_EMAIL}`);
  });
});

describe("the terms (AC-3)", () => {
  it("has its sections in the spec's order", () => {
    renderTerms();

    expect(h2Texts()).toEqual([
      "What Moviz is",
      "Your account",
      "Acceptable use",
      "Movie data and recommendations",
      "The service as it is",
      "Ending your account",
      "Changes to these terms",
      "Contact",
    ]);
  });

  it("says Moviz is free with no paid plans", () => {
    renderTerms();

    expect(sectionText("what-moviz-is")).toContain(
      "It is free. There are no paid plans",
    );
  });

  it("forbids scraping, automated sign ups and abuse of search or import", () => {
    renderTerms();
    const text = sectionText("acceptable-use");

    expect(text).toContain("scrape");
    expect(text).toContain("scripts or bots");
    expect(text).toContain("search or the import");
  });

  it("credits TMDB and JustWatch and gives no guarantee on picks", () => {
    renderTerms();
    const text = sectionText("movie-data");

    expect(text).toContain("TMDB");
    expect(text).toContain("JustWatch");
    expect(text).toContain("do not guarantee");
  });

  it("shows the terms version as a dated time element", () => {
    renderTerms();
    const time = within(
      document.getElementById("changes") as HTMLElement,
    ).getByText("12 November 2026");

    expect(time.getAttribute("datetime")).toBe(TERMS_VERSION);
  });

  it("ends with the contact section", () => {
    renderTerms();

    expect(sectionText("contact")).toContain(CONTACT_EMAIL);
  });
});

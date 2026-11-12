"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { ONBOARDING_PATH, SIGN_IN_PATH } from "@/auth/paths";
import { moviePath } from "@/movie/movie-path";
import { FeedItem } from "@/ui/feed-item";
import { Field } from "@/ui/field";
import { Button } from "@/ui/primitives/button";
import { biteSearchAction } from "./actions";
import {
  EMPTY_BODY,
  ERROR_MESSAGE,
  EXAMPLE_PHRASES,
  EXAMPLES_LABEL,
  emptyHeading,
  FIELD_LABEL,
  lookingForLine,
  PENDING_LABEL,
  picksAnnouncement,
  quotaMessage,
  resultsHeading,
  SEARCH_PATH,
  SESSION_ENDED_MESSAGE,
  SIGN_IN_AGAIN_LABEL,
  SUBMIT_LABEL,
  TOO_LONG_MESSAGE,
  TOO_SHORT_MESSAGE,
  WORDS_MODE_LINE,
} from "./constants";
import { checkPhrase, type PhraseProblem } from "./phrase";
import { biteReasonSentence } from "./reason-sentence";
import { useSearchStore } from "./search-store";
import type { BiteSearchResult } from "./types";

/** What the area under the form shows (spec 0012, State transitions). */
type View =
  | { kind: "idle" }
  | { kind: "results"; phrase: string; result: BiteSearchResult }
  | { kind: "empty"; phrase: string; result: BiteSearchResult }
  | { kind: "error" }
  | { kind: "quota"; resetsAt: string }
  | { kind: "session_ended" };

const SIGN_IN_AGAIN = `${SIGN_IN_PATH}?returnTo=${encodeURIComponent(SEARCH_PATH)}`;

const PROBLEM_MESSAGE: Record<PhraseProblem, string> = {
  too_short: TOO_SHORT_MESSAGE,
  too_long: TOO_LONG_MESSAGE,
};

/** The next UTC midnight as a time of day in the browser's own time zone. */
function localTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * The bite search form and its results (spec 0012). A labelled field, a
 * "Find picks" button and three example phrases that fill the field without
 * searching. The phrase is checked here first, so a refused phrase never
 * reaches the server or the quota (AC-2). While a search runs the button reads
 * "Searching…" and is `aria-disabled`, and a second submit does nothing
 * (AC-10). When a search ends, focus moves to what it produced: the results
 * heading, the empty state heading, the error or quota message, or the Sign
 * in again link (AC-11, AC-12), and the live region announces it.
 *
 * Results and the empty state are kept in the search store, so Back from a
 * movie page shows them again without a new search (AC-13).
 */
export function BiteSearch({ userId }: { userId: string }) {
  const store = useSearchStore();
  const router = useRouter();
  const [kept] = useState(() => store.read(userId));
  const [value, setValue] = useState(kept?.phrase ?? "");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [view, setView] = useState<View>(() =>
    kept
      ? {
          kind: kept.result.picks.length > 0 ? "results" : "empty",
          phrase: kept.phrase,
          result: kept.result,
        }
      : { kind: "idle" },
  );
  const [announcement, setAnnouncement] = useState("");
  const [focusRequest, setFocusRequest] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const headingId = useId();

  // Move focus to what the last search produced, only after a search.
  useEffect(() => {
    if (focusRequest > 0) targetRef.current?.focus();
  }, [focusRequest]);

  // Back from a movie page: focus the card that was opened.
  useEffect(() => {
    if (!kept?.openedId) return;
    listRef.current
      ?.querySelector<HTMLAnchorElement>(`[data-movie-id="${kept.openedId}"] a`)
      ?.focus();
  }, [kept]);

  function refuse(problem: PhraseProblem) {
    setFieldError(PROBLEM_MESSAGE[problem]);
    inputRef.current?.focus();
  }

  function show(next: View, spoken: string) {
    setView(next);
    setAnnouncement(spoken);
    setFocusRequest((n) => n + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const checked = checkPhrase(value);
    if (!checked.ok) return refuse(checked.problem);
    const { phrase } = checked;

    setFieldError(undefined);
    setAnnouncement("");
    setPending(true);
    const result = await biteSearchAction({ phrase }).catch(() => null);
    setPending(false);

    if (!result) return show({ kind: "error" }, ERROR_MESSAGE);
    if (!result.ok) {
      switch (result.error.code) {
        case "invalid_input":
          return refuse(
            result.error.reason === "too_long" ? "too_long" : "too_short",
          );
        case "not_onboarded":
          return router.push(ONBOARDING_PATH);
        case "unauthenticated":
          return show({ kind: "session_ended" }, SESSION_ENDED_MESSAGE);
        case "quota_exceeded":
          return show(
            { kind: "quota", resetsAt: result.error.resetsAt },
            quotaMessage(localTime(result.error.resetsAt)),
          );
        case "db_unavailable":
          return show({ kind: "error" }, ERROR_MESSAGE);
      }
    }

    const found = result.value;
    store.save({ userId, phrase, result: found, openedId: null });
    if (found.picks.length === 0) {
      return show(
        { kind: "empty", phrase, result: found },
        `${emptyHeading(phrase)} ${EMPTY_BODY}`,
      );
    }
    show(
      { kind: "results", phrase, result: found },
      picksAnnouncement(found.picks.length, phrase),
    );
  }

  const setTarget = (element: HTMLElement | null) => {
    targetRef.current = element;
  };

  return (
    <div className="flex flex-col gap-8">
      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        className="flex max-w-[62ch] flex-col gap-4"
      >
        <Field
          ref={inputRef}
          name="phrase"
          label={FIELD_LABEL}
          autoComplete="off"
          enterKeyHint="search"
          value={value}
          error={fieldError}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="flex flex-col gap-2">
          <p className="type-small" id={`${headingId}-examples`}>
            {EXAMPLES_LABEL}
          </p>
          <ul
            aria-labelledby={`${headingId}-examples`}
            className="flex flex-wrap gap-2"
          >
            {EXAMPLE_PHRASES.map((example) => (
              <li key={example}>
                <Button
                  type="button"
                  variant="secondary"
                  className="whitespace-normal text-left"
                  onClick={() => {
                    setValue(example);
                    setFieldError(undefined);
                    inputRef.current?.focus();
                  }}
                >
                  {example}
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <Button
            type="submit"
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            className="aria-disabled:cursor-default aria-disabled:opacity-50"
          >
            {pending ? PENDING_LABEL : SUBMIT_LABEL}
          </Button>
        </div>
      </form>

      <SearchOutcome
        view={view}
        headingId={headingId}
        setTarget={setTarget}
        listRef={listRef}
        onOpen={(movieId) => store.markOpened(movieId)}
      />

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

type OutcomeProps = {
  view: View;
  headingId: string;
  setTarget: (element: HTMLElement | null) => void;
  listRef: React.RefObject<HTMLUListElement | null>;
  onOpen: (movieId: number) => void;
};

/** The area under the form for one view. */
function SearchOutcome({
  view,
  headingId,
  setTarget,
  listRef,
  onOpen,
}: OutcomeProps) {
  switch (view.kind) {
    case "idle":
      return null;
    case "error":
      return (
        <p
          ref={setTarget}
          tabIndex={-1}
          data-slot="search-error"
          className="text-destructive"
        >
          {ERROR_MESSAGE}
        </p>
      );
    case "quota":
      return (
        <p ref={setTarget} tabIndex={-1} data-slot="search-quota">
          {quotaMessage(localTime(view.resetsAt))}
        </p>
      );
    case "session_ended":
      return (
        <div
          data-slot="search-session-ended"
          className="flex flex-col items-start gap-3"
        >
          <p>{SESSION_ENDED_MESSAGE}</p>
          <Button asChild>
            <Link ref={setTarget} href={SIGN_IN_AGAIN}>
              {SIGN_IN_AGAIN_LABEL}
            </Link>
          </Button>
        </div>
      );
    case "empty": {
      const looking = lookingForLine(view.result.filters.labels);
      return (
        <section
          aria-labelledby={headingId}
          data-slot="search-empty"
          className="flex flex-col items-start gap-4 rounded-sheet bg-card p-8"
        >
          <h2
            id={headingId}
            ref={setTarget}
            tabIndex={-1}
            className="type-section"
          >
            {emptyHeading(view.phrase)}
          </h2>
          <p className="max-w-[62ch] text-muted-foreground">{EMPTY_BODY}</p>
          {looking ? <p className="text-muted-foreground">{looking}</p> : null}
        </section>
      );
    }
    case "results": {
      const { mode, filters, picks } = view.result;
      const looking = lookingForLine(filters.labels);
      return (
        <section
          aria-labelledby={headingId}
          data-slot="search-results"
          className="flex flex-col gap-4"
        >
          <h2
            id={headingId}
            ref={setTarget}
            tabIndex={-1}
            className="type-section"
          >
            {resultsHeading(view.phrase)}
          </h2>
          {looking ? (
            <p data-slot="looking-for" className="text-muted-foreground">
              {looking}
            </p>
          ) : null}
          {mode === "words" ? (
            <p data-slot="words-mode" className="text-muted-foreground">
              {WORDS_MODE_LINE}
            </p>
          ) : null}
          <ul ref={listRef} className="feed-grid">
            {picks.map((pick) => (
              <li key={pick.movie.id} data-movie-id={pick.movie.id}>
                <FeedItem
                  movie={pick.movie}
                  reason={biteReasonSentence(pick.reason)}
                  href={moviePath(pick.movie.id)}
                  onNavigate={() => onOpen(pick.movie.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      );
    }
  }
}

"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HOME_PATH, ONBOARDING_PATH, SIGN_IN_PATH } from "@/auth/paths";
import type { SwipeChoice } from "@/ratings/swipe-score";
import { Button } from "@/ui/primitives/button";
import { ErrorState } from "@/ui/states/error-state";
import { announcement, type SwipeCardMovie } from "@/ui/swipe-card/swipe-card";
import { SwipeDeck } from "@/ui/swipe-card/swipe-deck";
import {
  finishOnboardingAction,
  swipeAction,
  undoSwipeAction,
} from "./actions";
import {
  canFinish,
  counterText,
  type DeckStatus,
  deckStatus,
  MIN_RATED,
  UNDO_TOAST_ID,
  UNDO_TOAST_MS,
} from "./deck-rules";

type LastSwipe = { movie: SwipeCardMovie; choice: SwipeChoice };

type OnboardingDeckProps = {
  /** The cards still to swipe, in deck order, from the server. */
  cards: SwipeCardMovie[];
  rated: number;
  shown: number;
};

const SIGN_IN_AGAIN = `${SIGN_IN_PATH}?returnTo=${encodeURIComponent(ONBOARDING_PATH)}`;

const MESSAGES = {
  swipe: "Couldn't save that swipe. Try again.",
  undo: "Couldn't undo that. Try again.",
  finish: "Couldn't finish just now. Try again.",
  notEnough: "Rate a few more movies first.",
  invalid: "Something went wrong. Try again.",
} as const;

const END_TITLES: Partial<Record<DeckStatus, string>> = {
  ended_enough: "That's plenty",
  ended_pool: "That's all the movies we have",
};

/** The deck announces nothing itself: this screen says the result and the count in one message. */
function ignoreAnnouncement() {}

/**
 * The toast that offers "Undo" for a few seconds. It is hidden from assistive
 * technology because the "Undo last swipe" button under the deck is the
 * accessible undo (spec 0006, AC-12); its own button leaves the tab order too.
 */
function UndoToast({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <div
      aria-hidden="true"
      className="flex w-full items-center justify-between gap-3 rounded-sheet border border-border bg-card py-1 pr-1 pl-4 text-foreground sm:w-[356px]"
    >
      <span>{text}</span>
      <Button variant="ghost" tabIndex={-1} onClick={onUndo}>
        Undo
      </Button>
    </div>
  );
}

/**
 * The first run swipe deck (spec 0006). It keeps a queue of the cards the server
 * sent, saves each swipe through `swipeAction` before the card moves on, and
 * takes the counters from the action results. One shared `busy` flag covers
 * every action, so nothing can run twice at once.
 */
export function OnboardingDeck({
  cards,
  rated: serverRated,
  shown: serverShown,
}: OnboardingDeckProps) {
  const router = useRouter();
  const [queue, setQueue] = useState(cards);
  const [rated, setRated] = useState(serverRated);
  const [shown, setShown] = useState(serverShown);
  const [last, setLast] = useState<LastSwipe | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [deckKey, setDeckKey] = useState(0);
  const [focusRestored, setFocusRestored] = useState(false);
  const [seenCards, setSeenCards] = useState(cards);

  const busyRef = useRef(false);
  const lastRef = useRef<LastSwipe | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStatus = useRef<DeckStatus | null>(null);

  // The server sent a fresh deck (after `router.refresh()`): start from it.
  if (cards !== seenCards) {
    setSeenCards(cards);
    setQueue(cards);
    setRated(serverRated);
    setShown(serverShown);
    setLast(null);
    lastRef.current = null;
  }

  const counts = { rated, shown, remaining: queue.length };
  const status = deckStatus(counts);
  const finishAllowed = canFinish(counts);
  const isEnded = status === "ended_pool" || status === "ended_enough";
  const catalogEmpty = status === "ended_pool" && rated === 0;

  // A new end state takes focus on its heading, and the undo toast goes away.
  useEffect(() => {
    const before = previousStatus.current;
    previousStatus.current = status;
    if (!isEnded) return;
    toast.dismiss(UNDO_TOAST_ID);
    if (before !== null && before !== status) headingRef.current?.focus();
  }, [status, isEnded]);

  function rememberLast(value: LastSwipe | null) {
    lastRef.current = value;
    setLast(value);
  }

  function begin() {
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
  }

  function end() {
    busyRef.current = false;
    setBusy(false);
  }

  /** Shows a message and announces it once. */
  function report(text: string) {
    setNotice(text);
    setLiveMessage(text);
  }

  function signInAgain() {
    router.replace(SIGN_IN_AGAIN);
  }

  async function decide(choice: SwipeChoice) {
    const card = queue[0];
    if (!card || busyRef.current) return;
    begin();
    const result = await swipeAction({ movieId: card.id, choice }).catch(
      () => null,
    );
    if (result?.ok) {
      const swiped: LastSwipe = { movie: card, choice };
      setQueue((current) => current.filter((movie) => movie.id !== card.id));
      setRated(result.value.rated);
      setShown(result.value.shown);
      rememberLast(swiped);
      setLiveMessage(
        `${announcement(choice, card.title)}. ${counterText(result.value.rated)}.`,
      );
      toast.custom(
        () => (
          <UndoToast
            text={announcement(choice, card.title)}
            onUndo={() => void undo(swiped)}
          />
        ),
        { id: UNDO_TOAST_ID, duration: UNDO_TOAST_MS },
      );
      end();
      return;
    }
    const code = result?.error.code ?? "db_unavailable";
    if (code === "unauthenticated") return signInAgain();
    if (code === "movie_not_found") {
      // The catalog withdrew it meanwhile: drop the card without a message.
      setQueue((current) => current.filter((movie) => movie.id !== card.id));
    } else {
      report(code === "invalid_input" ? MESSAGES.invalid : MESSAGES.swipe);
    }
    end();
  }

  async function undo(target: LastSwipe) {
    if (busyRef.current || lastRef.current !== target) return;
    begin();
    const result = await undoSwipeAction({
      movieId: target.movie.id,
      choice: target.choice,
    }).catch(() => null);
    if (result?.ok) {
      toast.dismiss(UNDO_TOAST_ID);
      rememberLast(null);
      setRated(result.value.rated);
      setShown(result.value.shown);
      if (result.value.restored) {
        setQueue((current) => [
          target.movie,
          ...current.filter((movie) => movie.id !== target.movie.id),
        ]);
        // A fresh deck, so the restored card appears at once and takes focus.
        setFocusRestored(true);
        setDeckKey((key) => key + 1);
        setLiveMessage(
          `${target.movie.title} is back. ${counterText(result.value.rated)}.`,
        );
      }
      end();
      return;
    }
    const code = result?.error.code ?? "db_unavailable";
    if (code === "unauthenticated") return signInAgain();
    report(code === "invalid_input" ? MESSAGES.invalid : MESSAGES.undo);
    end();
  }

  async function finish() {
    if (busyRef.current || !finishAllowed) return;
    begin();
    const result = await finishOnboardingAction().catch(() => null);
    if (result?.ok) {
      // Stay busy: the page is about to change. `replace` keeps Back off this deck.
      toast.dismiss(UNDO_TOAST_ID);
      router.replace(HOME_PATH);
      return;
    }
    const code = result?.error.code ?? "db_unavailable";
    if (code === "unauthenticated") return signInAgain();
    if (code === "not_enough_ratings") {
      // Another tab changed the counts: reload the deck from the server first.
      router.refresh();
      report(MESSAGES.notEnough);
    } else {
      report(MESSAGES.finish);
    }
    end();
  }

  const finishButton = (
    <Button
      type="button"
      aria-disabled={busy || undefined}
      onClick={() => void finish()}
      className="aria-disabled:opacity-50"
    >
      See my picks
    </Button>
  );

  const undoButton = last ? (
    <Button
      type="button"
      variant="secondary"
      aria-disabled={busy || undefined}
      onClick={() => void undo(last)}
      className="aria-disabled:opacity-50"
    >
      <Undo2 aria-hidden="true" />
      Undo last swipe
    </Button>
  ) : null;

  // The swiped card slides out sideways while its save runs; clipping keeps that
  // from adding a horizontal scrollbar (AC-12).
  return (
    <div className="page-container flex flex-col gap-6 overflow-x-clip py-6">
      <div className="flex max-w-[62ch] flex-col gap-2">
        <h1 className="type-section">What do you think of these?</h1>
        <p className="text-muted-foreground">
          Rate at least {MIN_RATED} movies. Not seen is fine, it just skips the
          movie.
        </p>
        {catalogEmpty ? null : (
          <p data-slot="onboarding-counter" className="type-title">
            {counterText(rated)}
          </p>
        )}
      </div>
      <p aria-live="polite" role="status" className="sr-only">
        {liveMessage}
      </p>

      {catalogEmpty ? (
        <ErrorState
          title="Movies aren't ready yet."
          body="Try again later."
          onRetry={() => router.refresh()}
        />
      ) : isEnded ? (
        <section
          data-slot="onboarding-end"
          className="swipe-column flex flex-col items-start gap-4 rounded-sheet bg-card p-6"
        >
          <h2 ref={headingRef} tabIndex={-1} className="type-section">
            {END_TITLES[status]}
          </h2>
          <p className="text-muted-foreground">Your picks are ready.</p>
          <div className="flex flex-wrap gap-3">
            {finishButton}
            {undoButton}
          </div>
          {notice ? <p className="text-destructive">{notice}</p> : null}
        </section>
      ) : (
        <>
          <SwipeDeck
            key={deckKey}
            movie={queue[0] ?? null}
            onDecide={(choice) => void decide(choice)}
            pending={busy}
            onAnnounce={ignoreAnnouncement}
            initialFocus={focusRestored ? "card" : undefined}
          />
          <div className="swipe-column flex flex-col items-stretch gap-3">
            {status === "can_finish" ? finishButton : null}
            {undoButton}
            {notice ? <p className="text-destructive">{notice}</p> : null}
          </div>
        </>
      )}
    </div>
  );
}

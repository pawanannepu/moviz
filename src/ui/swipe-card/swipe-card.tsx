"use client";

import { EyeOff, ThumbsDown, ThumbsUp } from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { POSTER_DIMENSIONS, posterUrl } from "@/catalog/images";
import type { CatalogMovie } from "@/catalog/read/get-movie";
import type { SwipeChoice } from "@/ratings/swipe-score";
import { cn } from "@/ui/cn";
import { PosterImage } from "@/ui/poster-image";
import { Button } from "@/ui/primitives/button";
import {
  AXIS_LOCK_PX,
  FLICK_WINDOW_MS,
  MAX_TILT_DEG,
  PREVIEW_SHARE,
} from "./constants";
import {
  commitDistances,
  decideFromDrag,
  dragHeading,
} from "./decide-from-drag";

export type SwipeCardMovie = Pick<
  CatalogMovie,
  "id" | "title" | "releaseYear" | "posterPath"
>;

/** How a decision was made. A button press moves focus back to that button. */
export type DecisionSource = "button" | "key" | "drag";

/** What should hold focus when a card appears. */
export type FocusTarget = "card" | SwipeChoice;

export type SwipeCardProps = {
  movie: SwipeCardMovie;
  /** Called once when a decision starts, with the choice and how it was made. */
  onDecide: (choice: SwipeChoice, source: DecisionSource) => void;
  /**
   * True while the parent saves the decision. Input is ignored meanwhile. If it
   * goes back to false with this same movie (the save failed), the card returns.
   */
  pending?: boolean;
  /** Writes a message into the deck's always mounted live region. */
  announce: (message: string) => void;
  /** Focus this element when the card appears (the deck sets it after a decision). */
  initialFocus?: FocusTarget;
  /** True for every card after the first, so it scales in. */
  entering?: boolean;
};

type Phase = "idle" | "dragging" | "committing";

type Sample = { t: number; x: number; y: number };

type DragState = {
  id: number;
  startX: number;
  startY: number;
  axis: "x" | "y" | null;
  dx: number;
  dy: number;
  width: number;
  height: number;
  samples: Sample[];
};

const CHOICES: readonly {
  choice: SwipeChoice;
  label: string;
  Icon: typeof ThumbsUp;
}[] = [
  { choice: "disliked", label: "Dislike", Icon: ThumbsDown },
  { choice: "not_seen", label: "Not seen", Icon: EyeOff },
  { choice: "liked", label: "Like", Icon: ThumbsUp },
];

const EXIT_DIRECTION: Record<SwipeChoice, "right" | "left" | "up"> = {
  liked: "right",
  disliked: "left",
  not_seen: "up",
};

const WORDS: Record<SwipeChoice, string> = {
  liked: "Like",
  disliked: "Dislike",
  not_seen: "Not seen",
};

const KEY_CHOICES: Record<string, SwipeChoice> = {
  ArrowRight: "liked",
  ArrowLeft: "disliked",
  ArrowUp: "not_seen",
};

/** The message the live region reads out after a decision. */
export function announcement(choice: SwipeChoice, title: string): string {
  if (choice === "liked") return `Liked ${title}`;
  if (choice === "disliked") return `Disliked ${title}`;
  return `Marked ${title} as not seen`;
}

/**
 * Keeps the drag coming to the poster even when the pointer leaves it. The
 * browser throws when the pointer is no longer active, which is not worth
 * stopping the gesture for, so that is ignored.
 */
function capturePointer(element: HTMLElement, pointerId: number, on: boolean) {
  try {
    if (on) element.setPointerCapture?.(pointerId);
    else element.releasePointerCapture?.(pointerId);
  } catch {
    // The pointer is gone. The gesture carries on without capture.
  }
}

/**
 * Speed over the last 100ms of the drag, in pixels per millisecond. Positive x
 * is right, positive y is down.
 */
function releaseVelocity(samples: Sample[]): { vx: number; vy: number } {
  const last = samples[samples.length - 1];
  if (!last) return { vx: 0, vy: 0 };
  const first =
    samples.find((sample) => last.t - sample.t <= FLICK_WINDOW_MS) ?? last;
  const elapsed = last.t - first.t;
  if (elapsed <= 0) return { vx: 0, vy: 0 };
  return { vx: (last.x - first.x) / elapsed, vy: (last.y - first.y) / elapsed };
}

/**
 * One movie to swipe (spec 0004, AC-10 to AC-13). Three labelled buttons
 * always work, with no drag at all. Dragging the poster right likes, left
 * dislikes, up marks not seen. When the card itself has focus, ArrowRight,
 * ArrowLeft and ArrowUp do the same. The card saves nothing: it calls
 * `onDecide`, and the screen that owns it does the saving.
 */
export function SwipeCard({
  movie,
  onDecide,
  pending = false,
  announce,
  initialFocus,
  entering = false,
}: SwipeCardProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [exit, setExit] = useState<SwipeChoice | null>(null);

  const hintId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Partial<Record<SwipeChoice, HTMLButtonElement>>>(
    {},
  );
  const drag = useRef<DragState | null>(null);
  // Set the moment a decision starts, so a second input in the same tick is ignored.
  const busy = useRef(false);
  const wasPending = useRef(pending);

  // Move focus to the new card, or to the same button the person just used.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, when this card mounts.
  useEffect(() => {
    if (initialFocus === undefined) return;
    const target =
      initialFocus === "card"
        ? rootRef.current
        : buttonRefs.current[initialFocus];
    target?.focus({ preventScroll: true });
  }, []);

  // The save failed (pending went back to false with the same movie): return the card.
  useEffect(() => {
    if (wasPending.current && !pending && busy.current) {
      busy.current = false;
      setPhase("idle");
      setExit(null);
    }
    wasPending.current = pending;
  }, [pending]);

  function commit(choice: SwipeChoice, source: DecisionSource) {
    if (busy.current || pending) return;
    busy.current = true;
    drag.current = null;
    setPhase("committing");
    setExit(choice);
    setOffset({ x: 0, y: 0 });
    announce(announcement(choice, movie.title));
    onDecide(choice, source);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Only when the card itself has focus, never a button inside it.
    if (event.target !== event.currentTarget) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    const choice = KEY_CHOICES[event.key];
    if (!choice) return;
    // ArrowUp would otherwise scroll the page.
    event.preventDefault();
    if (event.repeat) return;
    commit(choice, "key");
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (busy.current || pending) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: null,
      dx: 0,
      dy: 0,
      width: rect.width,
      height: rect.height,
      samples: [{ t: performance.now(), x: event.clientX, y: event.clientY }],
    };
    capturePointer(event.currentTarget, event.pointerId, true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const rawX = event.clientX - state.startX;
    const rawY = event.clientY - state.startY;

    if (state.axis === null) {
      if (Math.max(Math.abs(rawX), Math.abs(rawY)) < AXIS_LOCK_PX) return;
      state.axis = Math.abs(rawX) >= Math.abs(rawY) ? "x" : "y";
      setPhase("dragging");
      setSize({ width: state.width, height: state.height });
    }

    // Follow the locked axis only. Up is allowed, down is not.
    state.dx = state.axis === "x" ? rawX : 0;
    state.dy = state.axis === "y" ? Math.min(rawY, 0) : 0;
    state.samples.push({
      t: performance.now(),
      x: event.clientX,
      y: event.clientY,
    });
    setOffset({ x: state.dx, y: state.dy });
  }

  function handlePointerEnd(
    event: PointerEvent<HTMLDivElement>,
    canceled: boolean,
  ) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    capturePointer(event.currentTarget, event.pointerId, false);
    if (state.axis === null) return;

    const choice = canceled
      ? null
      : decideFromDrag({
          dx: state.dx,
          dy: state.dy,
          width: state.width,
          height: state.height,
          ...releaseVelocity(state.samples),
        });
    if (choice) {
      commit(choice, "drag");
    } else {
      setPhase("idle");
      setOffset({ x: 0, y: 0 });
    }
  }

  const heading =
    phase === "dragging"
      ? dragHeading({ dx: offset.x, dy: offset.y, ...size })
      : null;
  const previewWord =
    heading?.choice && heading.progress >= PREVIEW_SHARE
      ? WORDS[heading.choice]
      : null;
  const tilt =
    phase === "dragging"
      ? Math.max(-1, Math.min(1, offset.x / commitDistances(size).x)) *
        MAX_TILT_DEG
      : 0;

  const label =
    movie.releaseYear === null
      ? movie.title
      : `${movie.title}, ${movie.releaseYear}`;
  const { width, height } = POSTER_DIMENSIONS.w500;

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable group that takes arrow keys is the pattern the spec asks for; a fieldset is for form controls.
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      aria-describedby={hintId}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the card must take focus so the arrow keys work when it, not a button, has focus.
      tabIndex={0}
      data-slot="swipe-card"
      data-enter={entering ? "advance" : undefined}
      onKeyDown={handleKeyDown}
      className="swipe-column flex flex-col gap-4"
    >
      <div
        data-slot="swipe-poster"
        data-phase={phase}
        data-exit={exit ? EXIT_DIRECTION[exit] : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => handlePointerEnd(event, false)}
        onPointerCancel={(event) => handlePointerEnd(event, true)}
        style={
          phase === "dragging"
            ? {
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${tilt}deg)`,
              }
            : undefined
        }
        className={cn(
          "swipe-poster relative aspect-2/3 w-full overflow-hidden rounded-poster bg-card",
          phase === "dragging" && "glow-drag",
        )}
      >
        <PosterImage
          src={posterUrl(movie.posterPath, "w500")}
          alt={`Poster for ${movie.title}`}
          width={width}
          height={height}
          title={movie.title}
        />
        {previewWord ? (
          <p
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 rounded-poster bg-bar px-3 py-2 font-medium text-foreground text-lg"
          >
            {previewWord}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="type-title">{movie.title}</span>
        {movie.releaseYear === null ? null : (
          <span className="type-small">{movie.releaseYear}</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {CHOICES.map(({ choice, label: text, Icon }) => (
          <Button
            key={choice}
            ref={(element: HTMLButtonElement | null) => {
              if (element) buttonRefs.current[choice] = element;
              else delete buttonRefs.current[choice];
            }}
            type="button"
            variant="secondary"
            aria-disabled={pending || phase === "committing" ? true : undefined}
            onClick={() => commit(choice, "button")}
            className="h-auto min-h-14 flex-col gap-1 px-2 py-2 text-sm aria-disabled:opacity-50"
          >
            <Icon aria-hidden="true" />
            {text}
          </Button>
        ))}
      </div>

      <p id={hintId} className="type-small">
        Use arrow keys or the buttons
      </p>
    </div>
  );
}

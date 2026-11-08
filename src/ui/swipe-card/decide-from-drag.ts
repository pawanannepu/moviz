import type { SwipeChoice } from "@/ratings/swipe-score";
import {
  FLICK_MIN_DISTANCE_PX,
  FLICK_SPEED,
  HORIZONTAL_SHARE,
  MIN_DISTANCE_PX,
  VERTICAL_SHARE,
} from "./constants";

export type DragMeasure = {
  /** Distance dragged right (positive) or left (negative), in pixels. */
  dx: number;
  /** Distance dragged down (positive) or up (negative), in pixels. */
  dy: number;
  /** Card width and height in pixels. */
  width: number;
  height: number;
};

export type DragInput = DragMeasure & {
  /** Speed at release in pixels per millisecond, signed like `dx`. */
  vx: number;
  /** Speed at release in pixels per millisecond, signed like `dy`. */
  vy: number;
};

/** The distance that commits a drag on each axis, for a card of this size. */
export function commitDistances({
  width,
  height,
}: Pick<DragMeasure, "width" | "height">) {
  return {
    x: Math.max(MIN_DISTANCE_PX, width * HORIZONTAL_SHARE),
    y: Math.max(MIN_DISTANCE_PX, height * VERTICAL_SHARE),
  };
}

/**
 * Which choice a drag is heading for, and how far along it is (1 means it would
 * commit by distance). The larger movement decides the axis. Right is liked,
 * left is disliked, up is not seen. Down is nothing. Used to show the pending
 * action word while dragging.
 */
export function dragHeading(measure: DragMeasure): {
  choice: SwipeChoice | null;
  progress: number;
} {
  const { dx, dy } = measure;
  const need = commitDistances(measure);
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx === 0) return { choice: null, progress: 0 };
    return {
      choice: dx > 0 ? "liked" : "disliked",
      progress: Math.abs(dx) / need.x,
    };
  }
  if (dy < 0) return { choice: "not_seen", progress: -dy / need.y };
  return { choice: null, progress: 0 };
}

/**
 * Decides what a finished drag means (spec 0004, AC-11). Returns the choice, or
 * null when the card should return. Pure.
 *
 * A drag commits when it passes the commit distance, or when it is a flick: at
 * least 0.6px per millisecond over at least 40px, in the direction of the drag.
 * A downward drag never commits.
 */
export function decideFromDrag(input: DragInput): SwipeChoice | null {
  const { dx, dy, vx, vy } = input;
  const need = commitDistances(input);

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx === 0) return null;
    const far = Math.abs(dx) >= need.x;
    const flick =
      Math.abs(vx) >= FLICK_SPEED &&
      Math.abs(dx) >= FLICK_MIN_DISTANCE_PX &&
      Math.sign(vx) === Math.sign(dx);
    if (!far && !flick) return null;
    return dx > 0 ? "liked" : "disliked";
  }

  if (dy >= 0) return null;
  const far = -dy >= need.y;
  const flick = -vy >= FLICK_SPEED && -dy >= FLICK_MIN_DISTANCE_PX;
  return far || flick ? "not_seen" : null;
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXIT_MS } from "./constants";
import {
  commitDistances,
  decideFromDrag,
  dragHeading,
} from "./decide-from-drag";

const card = { width: 300, height: 450 };
// Commit distances for this card: sideways max(96, 90) = 96, up max(96, 112.5) = 112.5.
const still = { vx: 0, vy: 0 };

describe("decideFromDrag (AC-11)", () => {
  it("commits a drag right as liked", () => {
    expect(decideFromDrag({ ...card, ...still, dx: 120, dy: 5 })).toBe("liked");
  });

  it("commits a drag left as disliked", () => {
    expect(decideFromDrag({ ...card, ...still, dx: -120, dy: -5 })).toBe(
      "disliked",
    );
  });

  it("commits a drag up as not seen", () => {
    expect(decideFromDrag({ ...card, ...still, dx: 4, dy: -130 })).toBe(
      "not_seen",
    );
  });

  it("never commits a drag down", () => {
    expect(decideFromDrag({ ...card, ...still, dx: 0, dy: 300 })).toBeNull();
    expect(
      decideFromDrag({ ...card, vx: 0, vy: 2, dx: 0, dy: 300 }),
    ).toBeNull();
  });

  it("returns the card after a short, slow drag", () => {
    expect(decideFromDrag({ ...card, ...still, dx: 60, dy: 0 })).toBeNull();
    expect(decideFromDrag({ ...card, ...still, dx: 0, dy: -60 })).toBeNull();
  });

  it("commits just past the distance and not just short of it", () => {
    expect(decideFromDrag({ ...card, ...still, dx: 96, dy: 0 })).toBe("liked");
    expect(decideFromDrag({ ...card, ...still, dx: 95, dy: 0 })).toBeNull();
    expect(decideFromDrag({ ...card, ...still, dx: 0, dy: -112 })).toBeNull();
    expect(decideFromDrag({ ...card, ...still, dx: 0, dy: -113 })).toBe(
      "not_seen",
    );
  });

  it("commits a short, fast flick in its own direction", () => {
    expect(decideFromDrag({ ...card, vx: 0.8, vy: 0, dx: 50, dy: 0 })).toBe(
      "liked",
    );
    expect(decideFromDrag({ ...card, vx: -0.8, vy: 0, dx: -50, dy: 0 })).toBe(
      "disliked",
    );
    expect(decideFromDrag({ ...card, vx: 0, vy: -0.8, dx: 0, dy: -50 })).toBe(
      "not_seen",
    );
  });

  it("ignores a fast flick that is too short", () => {
    expect(decideFromDrag({ ...card, vx: 2, vy: 0, dx: 30, dy: 0 })).toBeNull();
  });

  it("ignores a fast movement back against the drag", () => {
    expect(
      decideFromDrag({ ...card, vx: -2, vy: 0, dx: 50, dy: 0 }),
    ).toBeNull();
  });

  it("uses the larger movement for a diagonal drag", () => {
    expect(decideFromDrag({ ...card, ...still, dx: 130, dy: -100 })).toBe(
      "liked",
    );
    expect(decideFromDrag({ ...card, ...still, dx: 40, dy: -140 })).toBe(
      "not_seen",
    );
  });

  it("returns the card when nothing moved", () => {
    expect(decideFromDrag({ ...card, ...still, dx: 0, dy: 0 })).toBeNull();
  });

  it("asks for 30% of a wide card and 25% of a tall one", () => {
    expect(commitDistances({ width: 600, height: 800 })).toEqual({
      x: 180,
      y: 200,
    });
    expect(
      decideFromDrag({ width: 600, height: 800, ...still, dx: 150, dy: 0 }),
    ).toBeNull();
    expect(
      decideFromDrag({ width: 600, height: 800, ...still, dx: 180, dy: 0 }),
    ).toBe("liked");
  });
});

describe("dragHeading", () => {
  it("names the choice a drag is heading for", () => {
    expect(dragHeading({ ...card, dx: 40, dy: 0 }).choice).toBe("liked");
    expect(dragHeading({ ...card, dx: -40, dy: 0 }).choice).toBe("disliked");
    expect(dragHeading({ ...card, dx: 0, dy: -40 }).choice).toBe("not_seen");
    expect(dragHeading({ ...card, dx: 0, dy: 40 }).choice).toBeNull();
  });

  it("reports progress as a share of the commit distance", () => {
    expect(dragHeading({ ...card, dx: 48, dy: 0 }).progress).toBeCloseTo(0.5);
    expect(dragHeading({ ...card, dx: 0, dy: -112.5 }).progress).toBeCloseTo(1);
  });
});

describe("exit time", () => {
  it("equals --dur-card in globals.css", () => {
    const css = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const match = /--dur-card:\s*(\d+)ms;/.exec(css);

    expect(Number(match?.[1])).toBe(EXIT_MS);
  });
});

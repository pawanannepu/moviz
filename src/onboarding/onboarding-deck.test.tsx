// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import type { SwipeCardMovie } from "@/ui/swipe-card/swipe-card";

// The Server Actions have their own tests. Here they are replaced, so these
// tests cover what the screen does with each result: the queue, the counters,
// the announcement, the undo, the finish, the end states and the messages
// (spec 0006, AC-3 to AC-10, AC-12).
const swipeAction = vi.fn();
const undoSwipeAction = vi.fn();
const finishOnboardingAction = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();
const toastCustom = vi.fn();
const toastDismiss = vi.fn();

vi.mock("./actions", () => ({
  swipeAction: (...args: unknown[]) => swipeAction(...args),
  undoSwipeAction: (...args: unknown[]) => undoSwipeAction(...args),
  finishOnboardingAction: (...args: unknown[]) =>
    finishOnboardingAction(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));
vi.mock("sonner", () => ({
  toast: {
    custom: (...args: unknown[]) => toastCustom(...args),
    dismiss: (...args: unknown[]) => toastDismiss(...args),
  },
}));

import { OnboardingDeck } from "./onboarding-deck";

const heat: SwipeCardMovie = {
  id: 1,
  title: "Heat",
  releaseYear: 1995,
  posterPath: "/heat.jpg",
};
const collateral: SwipeCardMovie = {
  id: 2,
  title: "Collateral",
  releaseYear: 2004,
  posterPath: "/collateral.jpg",
};
const ronin: SwipeCardMovie = {
  id: 3,
  title: "Ronin",
  releaseYear: 1998,
  posterPath: "/ronin.jpg",
};

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(HTMLImageElement.prototype, "complete", {
    configurable: true,
    get: () => false,
  });
  swipeAction.mockResolvedValue(ok({ rated: 1, shown: 1 }));
  undoSwipeAction.mockResolvedValue(ok({ rated: 0, shown: 0, restored: true }));
  finishOnboardingAction.mockResolvedValue(
    ok({ onboardedAt: "2026-11-10T12:00:00.000Z" }),
  );
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLImageElement.prototype, "complete");
});

type DeckProps = { cards: SwipeCardMovie[]; rated: number; shown: number };

function setUp(props: Partial<DeckProps> = {}) {
  const initial: DeckProps = {
    cards: [heat, collateral, ronin],
    rated: 0,
    shown: 0,
    ...props,
  };
  const view = render(<OnboardingDeck {...initial} />);
  return {
    ...view,
    update: (next: Partial<DeckProps>) =>
      view.rerender(<OnboardingDeck {...initial} {...next} />),
  };
}

const card = () => screen.queryByRole("group")?.getAttribute("aria-label");
const counter = () =>
  document.querySelector('[data-slot="onboarding-counter"]')?.textContent;
/** The visible message under the deck; the live region repeats it for screen readers. */
const message = () =>
  document.querySelector("p.text-destructive")?.textContent ?? null;
const showsMessage = (text: string) =>
  waitFor(() => expect(message()).toBe(text));
const live = () => screen.getByRole("status").textContent;
const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const finishButton = () =>
  screen.queryByRole("button", { name: "See my picks" });
const undoButton = () =>
  screen.queryByRole("button", { name: "Undo last swipe" });

/** A promise the test settles by hand, to look at the screen while an action is in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Likes the current card and waits until the next one is showing. */
async function likeAndWaitFor(next: SwipeCardMovie) {
  press("Like");
  await waitFor(() =>
    expect(card()).toBe(`${next.title}, ${next.releaseYear}`),
  );
}

describe("OnboardingDeck first screen (AC-4, AC-6)", () => {
  it("shows the heading, the line, the counter and the first card", () => {
    setUp();

    expect(
      screen.getByRole("heading", { name: "What do you think of these?" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Rate at least 10 movies. Not seen is fine, it just skips the movie.",
      ),
    ).toBeTruthy();
    expect(counter()).toBe("0 of 10 rated");
    expect(card()).toBe("Heat, 1995");
  });

  it("starts the counter from what the server says, not from zero (AC-6)", () => {
    setUp({ rated: 5, shown: 7 });

    expect(counter()).toBe("5 of 10 rated");
  });

  it("offers no finish and no undo before the first swipe", () => {
    setUp({ rated: 9, shown: 9 });

    expect(finishButton()).toBeNull();
    expect(undoButton()).toBeNull();
  });

  it("offers See my picks, and the plain count, from 10 ratings (AC-4)", () => {
    setUp({ rated: 10, shown: 10 });

    expect(counter()).toBe("10 rated");
    expect(finishButton()).not.toBeNull();
    expect(card()).toBe("Heat, 1995");
  });
});

describe("OnboardingDeck swiping (AC-3, AC-4, AC-5)", () => {
  it.each([
    ["Like", "liked"],
    ["Dislike", "disliked"],
    ["Not seen", "not_seen"],
  ] as const)("saves %s as %s for the card on show", async (button, choice) => {
    setUp();

    press(button);

    await waitFor(() =>
      expect(swipeAction).toHaveBeenCalledWith({ movieId: 1, choice }),
    );
  });

  it("moves to the next card and takes the counter from the result", async () => {
    swipeAction.mockResolvedValue(ok({ rated: 4, shown: 6 }));
    setUp({ rated: 3, shown: 5 });

    await likeAndWaitFor(collateral);

    expect(counter()).toBe("4 of 10 rated");
  });

  it("announces the result and the count in one message (AC-4, AC-12)", async () => {
    swipeAction.mockResolvedValue(ok({ rated: 4, shown: 4 }));
    setUp({ rated: 3, shown: 3 });

    press("Like");

    await waitFor(() => expect(live()).toBe("Liked Heat. 4 of 10 rated."));
  });

  it("announces a not seen swipe with the unchanged count", async () => {
    swipeAction.mockResolvedValue(ok({ rated: 3, shown: 4 }));
    setUp({ rated: 3, shown: 3 });

    press("Not seen");

    await waitFor(() =>
      expect(live()).toBe("Marked Heat as not seen. 3 of 10 rated."),
    );
  });

  it("uses the plain count in the announcement from 10 ratings (AC-4)", async () => {
    swipeAction.mockResolvedValue(ok({ rated: 10, shown: 10 }));
    setUp({ rated: 9, shown: 9 });

    press("Dislike");

    await waitFor(() => expect(live()).toBe("Disliked Heat. 10 rated."));
  });

  it("shows See my picks as soon as the tenth rating is saved (AC-4)", async () => {
    swipeAction.mockResolvedValue(ok({ rated: 10, shown: 10 }));
    setUp({ rated: 9, shown: 9 });

    await likeAndWaitFor(collateral);

    expect(finishButton()).not.toBeNull();
  });

  it("offers Undo last swipe after a swipe, and one toast with a fixed id for 6 seconds (AC-5)", async () => {
    setUp();

    await likeAndWaitFor(collateral);

    expect(undoButton()).not.toBeNull();
    expect(toastCustom).toHaveBeenCalledTimes(1);
    expect(toastCustom.mock.calls[0][1]).toEqual({
      id: "onboarding-undo",
      duration: 6000,
    });
  });

  it("replaces the toast with the same id on the next swipe, not a second toast (AC-5)", async () => {
    setUp();

    await likeAndWaitFor(collateral);
    await likeAndWaitFor(ronin);

    expect(toastCustom).toHaveBeenCalledTimes(2);
    const ids = toastCustom.mock.calls.map((call) => call[1].id);
    expect(new Set(ids).size).toBe(1);
  });

  it("hides the toast from assistive technology, since the button is the accessible undo (AC-12)", async () => {
    setUp();
    await likeAndWaitFor(collateral);

    const toast = render(toastCustom.mock.calls[0][0]());

    expect(toast.getByText("Liked Heat")).toBeTruthy();
    expect(
      toast.container.querySelector('[aria-hidden="true"]')?.textContent,
    ).toContain("Liked Heat");
    expect(toast.getByText("Undo").getAttribute("tabindex")).toBe("-1");
  });

  it("does not move the card on until the save has returned (AC-3)", async () => {
    const save = deferred<ReturnType<typeof ok>>();
    swipeAction.mockReturnValue(save.promise);
    setUp();

    press("Like");
    await waitFor(() => expect(swipeAction).toHaveBeenCalled());
    await new Promise((wait) => setTimeout(wait, 400));

    expect(card()).toBe("Heat, 1995");
    expect(counter()).toBe("0 of 10 rated");

    await act(async () => save.resolve(ok({ rated: 1, shown: 1 })));
    await waitFor(() => expect(card()).toBe("Collateral, 2004"));
  });
});

describe("OnboardingDeck failures (AC-10)", () => {
  it("keeps the same card and says the save failed, losing nothing", async () => {
    swipeAction.mockResolvedValue(err({ code: "db_unavailable" }));
    setUp({ rated: 2, shown: 2 });

    press("Like");

    await showsMessage("Couldn't save that swipe. Try again.");
    expect(card()).toBe("Heat, 1995");
    expect(counter()).toBe("2 of 10 rated");
    expect(undoButton()).toBeNull();
    expect(live()).toBe("Couldn't save that swipe. Try again.");
  });

  it("lets the same swipe be tried again after a failed save, and clears the message", async () => {
    swipeAction.mockResolvedValueOnce(err({ code: "db_unavailable" }));
    setUp();
    press("Like");
    await showsMessage("Couldn't save that swipe. Try again.");

    swipeAction.mockResolvedValueOnce(ok({ rated: 1, shown: 1 }));
    press("Like");

    await waitFor(() => expect(card()).toBe("Collateral, 2004"));
    expect(message()).toBeNull();
    expect(swipeAction).toHaveBeenCalledTimes(2);
    expect(swipeAction).toHaveBeenLastCalledWith({
      movieId: 1,
      choice: "liked",
    });
  });

  it("treats a request that throws like a database failure", async () => {
    swipeAction.mockRejectedValue(new Error("network down"));
    setUp();

    press("Like");

    await showsMessage("Couldn't save that swipe. Try again.");
    expect(card()).toBe("Heat, 1995");
  });

  it("says something went wrong for invalid input", async () => {
    swipeAction.mockResolvedValue(err({ code: "invalid_input" }));
    setUp();

    press("Like");

    await showsMessage("Something went wrong. Try again.");
    expect(card()).toBe("Heat, 1995");
  });

  it("drops a card the catalog withdrew, without a message", async () => {
    swipeAction.mockResolvedValue(err({ code: "movie_not_found" }));
    setUp();

    press("Like");

    await waitFor(() => expect(card()).toBe("Collateral, 2004"));
    expect(message()).toBeNull();
    expect(counter()).toBe("0 of 10 rated");
    expect(undoButton()).toBeNull();
  });

  it("sends a signed out user to sign in and back to the deck", async () => {
    swipeAction.mockResolvedValue(err({ code: "unauthenticated" }));
    setUp();

    press("Like");

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/sign-in?returnTo=%2Fonboarding"),
    );
  });

  it("runs one swipe at a time: a second press while one is in flight is ignored", async () => {
    const save = deferred<ReturnType<typeof ok>>();
    swipeAction.mockReturnValue(save.promise);
    setUp({ rated: 10, shown: 10 });

    press("Like");
    press("Like");
    press("Dislike");
    fireEvent.click(finishButton() as HTMLElement);

    expect(swipeAction).toHaveBeenCalledTimes(1);
    expect(finishOnboardingAction).not.toHaveBeenCalled();
    expect(finishButton()?.getAttribute("aria-disabled")).toBe("true");
    await act(async () => save.resolve(ok({ rated: 11, shown: 11 })));
  });

  it("disables Undo last swipe while the next swipe is in flight", async () => {
    setUp();
    await likeAndWaitFor(collateral);
    const save = deferred<ReturnType<typeof ok>>();
    swipeAction.mockReturnValue(save.promise);

    press("Like");
    await waitFor(() => expect(swipeAction).toHaveBeenCalledTimes(2));
    fireEvent.click(undoButton() as HTMLElement);

    expect(undoButton()?.getAttribute("aria-disabled")).toBe("true");
    expect(undoSwipeAction).not.toHaveBeenCalled();
    await act(async () => save.resolve(ok({ rated: 2, shown: 2 })));
  });
});

describe("OnboardingDeck undo (AC-5, AC-12)", () => {
  async function swipeOnce(choice: "Like" | "Not seen" = "Like") {
    press(choice);
    await waitFor(() => expect(card()).toBe("Collateral, 2004"));
  }

  it("sends the stored movie and choice, not anything else", async () => {
    setUp();
    await swipeOnce("Not seen");

    press("Undo last swipe");

    await waitFor(() =>
      expect(undoSwipeAction).toHaveBeenCalledWith({
        movieId: 1,
        choice: "not_seen",
      }),
    );
  });

  it("brings the movie back as the current card, lowers the count and takes focus to the card", async () => {
    swipeAction.mockResolvedValue(ok({ rated: 1, shown: 1 }));
    undoSwipeAction.mockResolvedValue(
      ok({ rated: 0, shown: 0, restored: true }),
    );
    setUp();
    await swipeOnce();

    press("Undo last swipe");

    await waitFor(() => expect(card()).toBe("Heat, 1995"));
    expect(counter()).toBe("0 of 10 rated");
    expect(live()).toBe("Heat is back. 0 of 10 rated.");
    expect(undoButton()).toBeNull();
    expect(toastDismiss).toHaveBeenCalledWith("onboarding-undo");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("group")),
    );
  });

  it("works from the toast's Undo action too", async () => {
    setUp();
    await swipeOnce();
    const toast = render(toastCustom.mock.calls[0][0]());

    fireEvent.click(toast.getByText("Undo"));

    await waitFor(() => expect(card()).toBe("Heat, 1995"));
    expect(undoSwipeAction).toHaveBeenCalledTimes(1);
  });

  it("puts the restored card first, ahead of the cards still waiting", async () => {
    setUp();
    await swipeOnce();
    await likeAndWaitFor(ronin);

    press("Undo last swipe");

    await waitFor(() => expect(card()).toBe("Collateral, 2004"));
  });

  it("restores nothing and says nothing when no row was deleted", async () => {
    swipeAction.mockResolvedValue(ok({ rated: 1, shown: 1 }));
    undoSwipeAction.mockResolvedValue(
      ok({ rated: 1, shown: 1, restored: false }),
    );
    setUp();
    await swipeOnce();

    press("Undo last swipe");

    await waitFor(() => expect(undoButton()).toBeNull());
    expect(card()).toBe("Collateral, 2004");
    expect(counter()).toBe("1 of 10 rated");
    expect(message()).toBeNull();
    expect(live()).toBe("Liked Heat. 1 of 10 rated.");
  });

  it("keeps the screen as it was and says so when the undo fails", async () => {
    undoSwipeAction.mockResolvedValue(err({ code: "db_unavailable" }));
    setUp();
    await swipeOnce();

    press("Undo last swipe");

    await showsMessage("Couldn't undo that. Try again.");
    expect(card()).toBe("Collateral, 2004");
    expect(undoButton()).not.toBeNull();
  });

  it("allows the undo to be tried again after it failed", async () => {
    undoSwipeAction.mockResolvedValueOnce(err({ code: "db_unavailable" }));
    setUp();
    await swipeOnce();
    press("Undo last swipe");
    await showsMessage("Couldn't undo that. Try again.");

    press("Undo last swipe");

    await waitFor(() => expect(card()).toBe("Heat, 1995"));
    expect(message()).toBeNull();
  });

  it("treats an undo that throws like a database failure", async () => {
    undoSwipeAction.mockRejectedValue(new Error("network down"));
    setUp();
    await swipeOnce();

    press("Undo last swipe");

    await showsMessage("Couldn't undo that. Try again.");
  });

  it("sends a signed out user to sign in", async () => {
    undoSwipeAction.mockResolvedValue(err({ code: "unauthenticated" }));
    setUp();
    await swipeOnce();

    press("Undo last swipe");

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/sign-in?returnTo=%2Fonboarding"),
    );
  });

  it("only undoes the last swipe: a second swipe replaces the one to undo", async () => {
    setUp();
    await swipeOnce();
    await likeAndWaitFor(ronin);

    press("Undo last swipe");

    await waitFor(() =>
      expect(undoSwipeAction).toHaveBeenCalledWith({
        movieId: 2,
        choice: "liked",
      }),
    );
  });
});

describe("OnboardingDeck finishing (AC-7, AC-10)", () => {
  it("finishes, then replaces the history entry with the home page so Back skips the deck", async () => {
    setUp({ rated: 10, shown: 10 });

    press("See my picks");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(finishOnboardingAction).toHaveBeenCalledTimes(1);
    expect(toastDismiss).toHaveBeenCalledWith("onboarding-undo");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stays disabled after a successful finish, so a second press cannot run it again", async () => {
    setUp({ rated: 10, shown: 10 });

    press("See my picks");
    await waitFor(() => expect(replace).toHaveBeenCalled());
    press("See my picks");

    expect(finishOnboardingAction).toHaveBeenCalledTimes(1);
  });

  it("says finishing failed, keeps the screen and keeps focus on the button", async () => {
    finishOnboardingAction.mockResolvedValue(err({ code: "db_unavailable" }));
    setUp({ rated: 10, shown: 10 });
    const button = finishButton() as HTMLElement;
    button.focus();

    fireEvent.click(button);

    await showsMessage("Couldn't finish just now. Try again.");
    expect(replace).not.toHaveBeenCalled();
    expect(card()).toBe("Heat, 1995");
    expect(document.activeElement).toBe(button);
    expect(live()).toBe("Couldn't finish just now. Try again.");
  });

  it("allows finishing to be tried again after it failed", async () => {
    finishOnboardingAction.mockResolvedValueOnce(
      err({ code: "db_unavailable" }),
    );
    setUp({ rated: 10, shown: 10 });
    press("See my picks");
    await showsMessage("Couldn't finish just now. Try again.");

    press("See my picks");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
  });

  it("treats a finish that throws like a database failure", async () => {
    finishOnboardingAction.mockRejectedValue(new Error("network down"));
    setUp({ rated: 10, shown: 10 });

    press("See my picks");

    await showsMessage("Couldn't finish just now. Try again.");
  });

  it("reloads the deck from the server when the server says there are too few ratings, then says so", async () => {
    finishOnboardingAction.mockResolvedValue(
      err({ code: "not_enough_ratings" }),
    );
    setUp({ rated: 10, shown: 10 });

    press("See my picks");

    await showsMessage("Rate a few more movies first.");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("starts again from the fresh deck the server sends after that refresh", async () => {
    finishOnboardingAction.mockResolvedValue(
      err({ code: "not_enough_ratings" }),
    );
    const view = setUp({ rated: 10, shown: 10 });
    press("See my picks");
    await showsMessage("Rate a few more movies first.");

    view.update({ cards: [ronin, heat], rated: 9, shown: 9 });

    await waitFor(() => expect(counter()).toBe("9 of 10 rated"));
    expect(finishButton()).toBeNull();
  });

  it("sends a signed out user to sign in", async () => {
    finishOnboardingAction.mockResolvedValue(err({ code: "unauthenticated" }));
    setUp({ rated: 10, shown: 10 });

    press("See my picks");

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/sign-in?returnTo=%2Fonboarding"),
    );
  });
});

describe("OnboardingDeck end states (AC-8, AC-9, AC-12)", () => {
  it("shows That's plenty from 20 ratings, in place of the deck, with the finish button", () => {
    setUp({ rated: 20, shown: 20 });

    expect(screen.getByRole("heading", { name: "That's plenty" })).toBeTruthy();
    expect(screen.getByText("Your picks are ready.")).toBeTruthy();
    expect(finishButton()).not.toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByRole("button", { name: "Like" })).toBeNull();
  });

  it("shows That's plenty at 10 ratings and 30 cards dealt", () => {
    setUp({ rated: 10, shown: 30 });

    expect(screen.getByRole("heading", { name: "That's plenty" })).toBeTruthy();
  });

  it("keeps dealing cards below 10 ratings however many were dealt (AC-9)", () => {
    setUp({ rated: 9, shown: 60 });

    expect(screen.queryByRole("heading", { name: "That's plenty" })).toBeNull();
    expect(card()).toBe("Heat, 1995");
  });

  it("shows That's all the movies we have when the pool is used up, and allows finishing (AC-9)", () => {
    setUp({ cards: [], rated: 3, shown: 8 });

    expect(
      screen.getByRole("heading", { name: "That's all the movies we have" }),
    ).toBeTruthy();
    expect(finishButton()).not.toBeNull();
  });

  it("shows the error state, with no counter and no finish, for an empty catalog (AC-9)", () => {
    setUp({ cards: [], rated: 0, shown: 0 });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Movies aren't ready yet.");
    expect(alert.textContent).toContain("Try again later.");
    expect(counter()).toBeUndefined();
    expect(finishButton()).toBeNull();
  });

  it("asks the server for a fresh deck when Try again is pressed on the empty catalog", () => {
    setUp({ cards: [], rated: 0, shown: 0 });

    press("Try again");

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the heading of a new end state and dismisses the toast", async () => {
    swipeAction.mockResolvedValue(ok({ rated: 20, shown: 20 }));
    setUp({ rated: 19, shown: 19 });

    press("Like");

    const heading = await screen.findByRole("heading", {
      name: "That's plenty",
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(toastDismiss).toHaveBeenCalledWith("onboarding-undo");
  });

  it("does not steal focus when the page loads already in an end state", () => {
    setUp({ rated: 20, shown: 20 });

    expect(document.activeElement).toBe(document.body);
  });

  it("goes to the pool-used-up end state when the last card is swiped with few ratings", async () => {
    swipeAction.mockResolvedValue(ok({ rated: 3, shown: 3 }));
    setUp({ cards: [heat], rated: 2, shown: 2 });

    press("Like");

    expect(
      await screen.findByRole("heading", {
        name: "That's all the movies we have",
      }),
    ).toBeTruthy();
  });

  it("finishes from the end state", async () => {
    setUp({ rated: 20, shown: 20 });

    press("See my picks");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
  });

  it("shows a failed finish message inside the end state and keeps focus on the button", async () => {
    finishOnboardingAction.mockResolvedValue(err({ code: "db_unavailable" }));
    setUp({ rated: 20, shown: 20 });
    const button = finishButton() as HTMLElement;
    button.focus();

    fireEvent.click(button);

    await showsMessage("Couldn't finish just now. Try again.");
    expect(document.activeElement).toBe(button);
  });

  it("undo from the end state leaves it, brings the last card back and puts focus on the card", async () => {
    swipeAction.mockResolvedValue(ok({ rated: 20, shown: 20 }));
    undoSwipeAction.mockResolvedValue(
      ok({ rated: 19, shown: 19, restored: true }),
    );
    setUp({ rated: 19, shown: 19 });
    press("Like");
    await screen.findByRole("heading", { name: "That's plenty" });

    press("Undo last swipe");

    await waitFor(() => expect(card()).toBe("Heat, 1995"));
    expect(screen.queryByRole("heading", { name: "That's plenty" })).toBeNull();
    expect(counter()).toBe("19 rated");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("group")),
    );
  });

  it("gives the end state heading no tab stop of its own, only programmatic focus", () => {
    setUp({ rated: 20, shown: 20 });

    expect(
      screen
        .getByRole("heading", { name: "That's plenty" })
        .getAttribute("tabindex"),
    ).toBe("-1");
  });
});

// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import { axeViolations } from "@/test-support/axe";

// The Server Action has its own tests. Here it is replaced through the `save`
// prop, so these tests cover the disclosure itself: open and close, focus,
// the refresh after a save, and the error lines (spec 0013, AC-6, AC-10).
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/movie/42",
}));
vi.mock("./actions", () => ({ setCountryAction: vi.fn() }));

import type { SetCountryResult } from "./actions";
import { CountryPicker } from "./country-picker";
import type { CountryOption } from "./regions";

const OPTIONS: CountryOption[] = [
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "US", name: "United States" },
];
const TARGET = "country-line";
const save = vi.fn<(input: { country: string }) => Promise<SetCountryResult>>();

function renderPicker(current: string | null = "US") {
  return render(
    <div>
      <p id={TARGET} tabIndex={-1}>
        Line
      </p>
      <CountryPicker
        current={current}
        options={OPTIONS}
        focusTargetId={TARGET}
        save={save}
      />
    </div>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  save.mockResolvedValue(ok({ country: "FR" }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const toggle = () => screen.getByRole("button", { name: "Change country" });
const select = () => screen.getByLabelText("Country") as HTMLSelectElement;
const saveButton = () => screen.getByRole("button", { name: "Save" });
const focused = () => document.activeElement;

async function open() {
  await act(async () => {
    fireEvent.click(toggle());
  });
}

function choose(code: string) {
  fireEvent.change(select(), { target: { value: code } });
}

/** Presses Save the way a keyboard user does: focus, then activate. */
async function pressSave() {
  const button = saveButton();
  button.focus();
  await act(async () => {
    fireEvent.click(button);
  });
}

describe("CountryPicker with a country (AC-6)", () => {
  it("starts closed, with only the Change country button", () => {
    renderPicker();

    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Country")).toBeNull();
  });

  it("opens on Change country and moves focus to the labelled select", async () => {
    renderPicker();

    await open();

    expect(focused()).toBe(select());
    expect(select().value).toBe("US");
    expect(
      within(select())
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["France", "Germany", "United States"]);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("closes on Escape and returns focus to Change country", async () => {
    renderPicker();
    await open();

    await act(async () => {
      fireEvent.keyDown(select(), { key: "Escape" });
    });

    await waitFor(() => expect(focused()).toBe(toggle()));
    expect(save).not.toHaveBeenCalled();
  });

  it("closes on Cancel, drops the unsaved choice and returns focus", async () => {
    renderPicker();
    await open();
    choose("DE");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    await waitFor(() => expect(focused()).toBe(toggle()));
    await open();

    expect(select().value).toBe("US");
  });

  it("saves the chosen country, refreshes the page and focuses the country line (AC-6, AC-10)", async () => {
    renderPicker();
    await open();
    choose("FR");

    await pressSave();

    expect(save).toHaveBeenCalledWith({ country: "FR" });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(focused()).toBe(document.getElementById(TARGET)),
    );
    expect(toggle()).toBeTruthy();
  });

  it("is clean under axe when open", async () => {
    const { container } = renderPicker();
    await open();

    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("CountryPicker with no country (AC-5)", () => {
  it("is open from the start, with a prompt option and no Cancel", () => {
    renderPicker(null);

    expect(select().value).toBe("");
    expect(within(select()).getAllByRole("option")[0].textContent).toBe(
      "Choose a country",
    );
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change country" })).toBeNull();
  });

  it("asks for a country when Save is pressed with none chosen", async () => {
    renderPicker(null);

    await pressSave();

    expect(screen.getByRole("alert").textContent).toBe(
      "Choose a country first.",
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("ignores Escape, because there is nothing to go back to", async () => {
    renderPicker(null);

    await act(async () => {
      fireEvent.keyDown(select(), { key: "Escape" });
    });

    expect(select()).toBeTruthy();
  });

  it("is clean under axe", async () => {
    const { container } = renderPicker(null);

    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("CountryPicker save failures (AC-10)", () => {
  it.each(["db_unavailable", "invalid_input"] as const)(
    "shows the save error for %s, keeps focus on Save and does not refresh",
    async (code) => {
      save.mockResolvedValue(err({ code }));
      renderPicker();
      await open();

      await pressSave();

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe("Could not save your country. Try again.");
      expect(focused()).toBe(saveButton());
      expect(refresh).not.toHaveBeenCalled();
    },
  );

  it("shows Your session ended with a Sign in again link back to this page", async () => {
    save.mockResolvedValue(err({ code: "unauthenticated" }));
    renderPicker();
    await open();

    await pressSave();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your session ended.");
    expect(
      within(alert)
        .getByRole("link", { name: "Sign in again" })
        .getAttribute("href"),
    ).toBe("/sign-in?returnTo=%2Fmovie%2F42");
  });

  it("clears the error once a later save succeeds", async () => {
    save.mockResolvedValueOnce(err({ code: "db_unavailable" }));
    renderPicker();
    await open();
    await pressSave();
    await screen.findByRole("alert");

    await pressSave();

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores a second press while a save is in flight", async () => {
    let finish: (value: SetCountryResult) => void = () => undefined;
    save.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderPicker();
    await open();

    await pressSave();
    expect(saveButton().getAttribute("aria-disabled")).toBe("true");
    await pressSave();
    await act(async () => finish(ok({ country: "US" })));

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("shows the save error, not a crash, when the request itself fails", async () => {
    save.mockRejectedValue(new Error("network down"));
    renderPicker();
    await open();

    await pressSave();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not save your country. Try again.");
  });
});

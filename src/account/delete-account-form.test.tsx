// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@/test-support/axe";

// Spec 0014: the delete form (AC-9, AC-10, AC-11). Better Auth's client is the
// boundary: it is the only thing mocked.
const deleteUser = vi.fn();
vi.mock("@/auth/client", () => ({
  authClient: { deleteUser: (input: unknown) => deleteUser(input) },
}));

const { DeleteAccountForm } = await import("./delete-account-form");

type ClientResult = {
  data: unknown;
  error: { code?: string; status?: number } | null;
};

let assign: ReturnType<typeof vi.fn<(url: string | URL) => void>>;

beforeEach(() => {
  deleteUser.mockReset();
  assign = vi.fn<(url: string | URL) => void>();
  vi.spyOn(window.location, "assign").mockImplementation(assign);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const passwordInput = () =>
  screen.getByLabelText("Your password") as HTMLInputElement;
const deleteButton = () => screen.getByRole("button", { name: /Delet/ });

function submitWith(password: string) {
  fireEvent.change(passwordInput(), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
}

describe("DeleteAccountForm, the form (AC-9)", () => {
  it("has a labelled current password field and a Delete my account button", () => {
    render(<DeleteAccountForm />);

    expect(passwordInput().getAttribute("autocomplete")).toBe(
      "current-password",
    );
    expect(passwordInput().getAttribute("type")).toBe("password");
    expect(
      screen.getByRole("button", { name: "Delete my account" }),
    ).toBeTruthy();
  });

  it("has no accessibility violations, idle and with an error", async () => {
    const { container } = render(<DeleteAccountForm />);
    expect(await axeViolations(container)).toEqual([]);

    deleteUser.mockResolvedValue({
      data: null,
      error: { code: "INVALID_PASSWORD", status: 400 },
    } satisfies ClientResult);
    submitWith("wrong-password");
    await screen.findByText("That password is not right.");

    expect(await axeViolations(container)).toEqual([]);
  });

  it("sends only the typed password to Better Auth", async () => {
    deleteUser.mockResolvedValue({ data: { success: true }, error: null });
    render(<DeleteAccountForm />);

    submitWith("correct-horse-1");

    await waitFor(() => expect(deleteUser).toHaveBeenCalledTimes(1));
    expect(deleteUser).toHaveBeenCalledWith({ password: "correct-horse-1" });
  });
});

describe("DeleteAccountForm, success (AC-10)", () => {
  it("does a full page load to /?deleted=1", async () => {
    deleteUser.mockResolvedValue({ data: { success: true }, error: null });
    render(<DeleteAccountForm />);

    submitWith("correct-horse-1");

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/?deleted=1"));
  });

  it("stays pending while the page goes away", async () => {
    deleteUser.mockResolvedValue({ data: { success: true }, error: null });
    render(<DeleteAccountForm />);

    submitWith("correct-horse-1");

    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(deleteButton().textContent).toBe("Deleting…");
  });
});

describe("DeleteAccountForm, failures (AC-11)", () => {
  it("shows a field error for an empty password, focuses the field, and calls nothing", async () => {
    render(<DeleteAccountForm />);

    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(await screen.findByText("Enter your password.")).toBeTruthy();
    expect(passwordInput().getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(passwordInput()));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    [{ code: "INVALID_PASSWORD", status: 400 }, "That password is not right."],
    [
      { code: undefined, status: 429 },
      "Too many tries. Wait a minute and try again.",
    ],
    [
      { code: "DELETE_FAILED", status: 500 },
      "Could not delete your account. Try again.",
    ],
  ])(
    "shows one focused line above the button for %o",
    async (error, message) => {
      deleteUser.mockResolvedValue({
        data: null,
        error,
      } satisfies ClientResult);
      render(<DeleteAccountForm />);

      submitWith("some-password");

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(message);
      await waitFor(() => expect(document.activeElement).toBe(alert));
      expect(
        alert.compareDocumentPosition(deleteButton()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it("shows a server PASSWORD_REQUIRED as the field error", async () => {
    deleteUser.mockResolvedValue({
      data: null,
      error: { code: "PASSWORD_REQUIRED", status: 400 },
    } satisfies ClientResult);
    render(<DeleteAccountForm />);

    submitWith("x");

    expect(await screen.findByText("Enter your password.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the generic line when the request itself throws", async () => {
    deleteUser.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<DeleteAccountForm />);

    submitWith("some-password");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not delete your account. Try again.",
    );
  });

  it("moves focus to the line again when the same error repeats", async () => {
    deleteUser.mockResolvedValue({
      data: null,
      error: { code: "INVALID_PASSWORD", status: 400 },
    } satisfies ClientResult);
    render(<DeleteAccountForm />);
    submitWith("wrong-1");
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));

    passwordInput().focus();
    submitWith("wrong-2");

    await waitFor(() => expect(deleteUser).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("alert")),
    );
  });

  it("lets the user try again after a failure", async () => {
    deleteUser
      .mockResolvedValueOnce({
        data: null,
        error: { code: "INVALID_PASSWORD", status: 400 },
      })
      .mockResolvedValueOnce({ data: { success: true }, error: null });
    render(<DeleteAccountForm />);

    submitWith("wrong");
    await screen.findByRole("alert");
    submitWith("right");

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/?deleted=1"));
  });
});

describe("DeleteAccountForm, pending (AC-11)", () => {
  it("reads Deleting…, is aria-disabled, and ignores a second submit", async () => {
    let finish: (value: ClientResult) => void = () => {};
    deleteUser.mockReturnValue(
      new Promise<ClientResult>((resolve) => {
        finish = resolve;
      }),
    );
    render(<DeleteAccountForm />);

    submitWith("correct-horse-1");
    await waitFor(() => expect(deleteButton().textContent).toBe("Deleting…"));
    expect(deleteButton().getAttribute("aria-disabled")).toBe("true");
    fireEvent.submit(deleteButton().closest("form") as HTMLFormElement);
    fireEvent.click(deleteButton());

    expect(deleteUser).toHaveBeenCalledTimes(1);
    finish({ data: null, error: { code: "INVALID_PASSWORD", status: 400 } });
    await screen.findByRole("alert");
    expect(deleteButton().textContent).toBe("Delete my account");
    expect(deleteButton().getAttribute("aria-disabled")).toBe("false");
  });
});

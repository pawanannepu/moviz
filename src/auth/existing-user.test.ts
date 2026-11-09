import { afterEach, describe, expect, it, vi } from "vitest";
import { handleExistingUserSignUp } from "./existing-user";

const ORIGIN = "https://moviz.example";

function deps(
  overrides: Partial<Parameters<typeof handleExistingUserSignUp>[1]> = {},
) {
  return {
    origin: ORIGIN,
    send: vi.fn().mockResolvedValue({ ok: true }),
    requestReset: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleExistingUserSignUp (AC-7)", () => {
  it("tells the owner of a verified account that an account exists, with both links", async () => {
    const d = deps();

    await handleExistingUserSignUp(
      { email: "ana@example.com", emailVerified: true },
      d,
    );

    expect(d.requestReset).not.toHaveBeenCalled();
    expect(d.send).toHaveBeenCalledTimes(1);
    const message = vi.mocked(d.send).mock.calls[0]?.[0];
    expect(message.to).toBe("ana@example.com");
    expect(message.subject).toBe("You already have a Moviz account");
    expect(message.text).toContain("https://moviz.example/sign-in");
    expect(message.text).toContain("https://moviz.example/forgot-password");
  });

  it("sends no token in the account exists email", async () => {
    const d = deps();

    await handleExistingUserSignUp(
      { email: "ana@example.com", emailVerified: true },
      d,
    );

    const message = vi.mocked(d.send).mock.calls[0]?.[0];
    expect(message.text).not.toMatch(/token=/);
    expect(message.html).not.toMatch(/token=/);
  });

  it("starts a password reset for an unverified account, and sends no other email", async () => {
    const d = deps();

    await handleExistingUserSignUp(
      { email: "ana@example.com", emailVerified: false },
      d,
    );

    expect(d.requestReset).toHaveBeenCalledWith("ana@example.com");
    expect(d.send).not.toHaveBeenCalled();
  });

  it("never throws when the reset call fails, and logs no address", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const d = deps({
      requestReset: vi
        .fn()
        .mockRejectedValue(new TypeError("boom ana@example.com")),
    });

    await expect(
      handleExistingUserSignUp(
        { email: "ana@example.com", emailVerified: false },
        d,
      ),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).not.toContain("ana@example.com");
  });

  it("never throws when the send fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const d = deps({ send: vi.fn().mockRejectedValue(new Error("down")) });

    await expect(
      handleExistingUserSignUp(
        { email: "ana@example.com", emailVerified: true },
        d,
      ),
    ).resolves.toBeUndefined();
  });

  it("skips the email, and says so without the address, when no site origin is known", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const d = deps({ origin: undefined });

    await handleExistingUserSignUp(
      { email: "ana@example.com", emailVerified: true },
      d,
    );

    expect(d.send).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[0])).not.toContain("ana@example.com");
  });
});

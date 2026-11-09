import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const fakeEnv: {
  RESEND_API_KEY: string | undefined;
  EMAIL_FROM: string | undefined;
  VERCEL_ENV: string | undefined;
} = { RESEND_API_KEY: undefined, EMAIL_FROM: undefined, VERCEL_ENV: undefined };

vi.mock("@/env", () => ({ env: fakeEnv }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const { pickTransport, sendEmail } = await import("./send");

const MESSAGE = {
  to: "ana@example.com",
  subject: "Subject",
  text: "Body with https://moviz.example/link?token=secret-token",
  html: "<p>Body</p>",
};

beforeEach(() => {
  fakeEnv.RESEND_API_KEY = undefined;
  fakeEnv.EMAIL_FROM = undefined;
  fakeEnv.VERCEL_ENV = undefined;
  sendMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pickTransport (AC-14)", () => {
  it("uses Resend when both settings exist", () => {
    expect(
      pickTransport({
        resendApiKey: "k",
        emailFrom: "a@b.test",
        vercelEnv: "production",
      }),
    ).toBe("resend");
    expect(
      pickTransport({
        resendApiKey: "k",
        emailFrom: "a@b.test",
        vercelEnv: undefined,
      }),
    ).toBe("resend");
  });

  it("prints to the console only in local development", () => {
    expect(
      pickTransport({
        resendApiKey: undefined,
        emailFrom: undefined,
        vercelEnv: undefined,
      }),
    ).toBe("console");
  });

  it.each(["preview", "production"])(
    "refuses to print on %s, where a console fallback would put tokens in hosted logs",
    (vercelEnv) => {
      expect(
        pickTransport({
          resendApiKey: undefined,
          emailFrom: undefined,
          vercelEnv,
        }),
      ).toBe("none");
    },
  );

  it("needs both settings, not one", () => {
    expect(
      pickTransport({
        resendApiKey: "k",
        emailFrom: undefined,
        vercelEnv: undefined,
      }),
    ).toBe("console");
    expect(
      pickTransport({
        resendApiKey: undefined,
        emailFrom: "a@b.test",
        vercelEnv: "preview",
      }),
    ).toBe("none");
  });
});

describe("sendEmail (AC-14)", () => {
  it("prints the message to the console in local development", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ ok: true });
    expect(String(info.mock.calls[0]?.[0])).toContain(
      "[email] to: ana@example.com",
    );
    expect(String(info.mock.calls[0]?.[0])).toContain("token=secret-token");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends through Resend with the configured sender", async () => {
    fakeEnv.RESEND_API_KEY = "re_key";
    fakeEnv.EMAIL_FROM = "Moviz <hi@moviz.example>";
    sendMock.mockResolvedValue({ error: null });

    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledWith({
      from: "Moviz <hi@moviz.example>",
      to: "ana@example.com",
      subject: "Subject",
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
  });

  it("returns a typed failure, not an exception, when Resend reports an error", async () => {
    fakeEnv.RESEND_API_KEY = "re_key";
    fakeEnv.EMAIL_FROM = "hi@moviz.example";
    sendMock.mockResolvedValue({
      error: { name: "validation_error", message: "to ana@example.com is bad" },
    });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ ok: false, error: { code: "email_not_sent" } });
    const logged = String(error.mock.calls[0]?.[0]);
    expect(logged).toContain("validation_error");
    expect(logged).not.toContain("ana@example.com");
    expect(logged).not.toContain("secret-token");
  });

  it("returns a typed failure when the Resend call throws", async () => {
    fakeEnv.RESEND_API_KEY = "re_key";
    fakeEnv.EMAIL_FROM = "hi@moviz.example";
    sendMock.mockRejectedValue(new Error("network down for ana@example.com"));
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(sendEmail(MESSAGE)).resolves.toEqual({
      ok: false,
      error: { code: "email_not_sent" },
    });
    expect(String(error.mock.calls[0]?.[0])).not.toContain("ana@example.com");
  });

  it("fails with a typed result, and does not print, when hosted with no sender", async () => {
    fakeEnv.VERCEL_ENV = "production";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ ok: false, error: { code: "email_not_sent" } });
    expect(info).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});

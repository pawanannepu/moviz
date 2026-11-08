// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Field } from "./field";
import { Button } from "./primitives/button";
import { Skeleton } from "./primitives/skeleton";

afterEach(cleanup);

describe("Button (AC-6)", () => {
  it("styles each variant", () => {
    render(
      <>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
      </>,
    );

    expect(screen.getByText("Primary").className).toContain("bg-primary");
    expect(screen.getByText("Secondary").className).toContain("border-border");
    expect(screen.getByText("Ghost").className).toContain("bg-transparent");
    expect(screen.getByText("Destructive").className).toContain(
      "text-destructive",
    );
  });

  it("is at least 44px high in every size", () => {
    render(
      <>
        <Button>Default</Button>
        <Button size="large">Large</Button>
        <Button size="icon" aria-label="Icon" />
      </>,
    );

    // min-h-11 is 44px, min-h-12 is 48px, size-11 is 44 by 44.
    expect(screen.getByText("Default").className).toContain("min-h-11");
    expect(screen.getByText("Large").className).toContain("min-h-12");
    expect(screen.getByLabelText("Icon").className).toContain("size-11");
  });

  it("renders the child element when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/start">Start</a>
      </Button>,
    );

    expect(
      screen.getByRole("link", { name: "Start" }).getAttribute("href"),
    ).toBe("/start");
  });
});

describe("Field (AC-6)", () => {
  it("links the label to the input", () => {
    render(<Field label="Email" />);

    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("lists the hint, then the error, in aria-describedby and marks the input invalid", () => {
    render(
      <Field label="Email" hint="Used to sign in." error="Enter an email." />,
    );
    const input = screen.getByLabelText("Email");
    const [hintId, errorId] = (
      input.getAttribute("aria-describedby") ?? ""
    ).split(" ");

    expect(document.getElementById(hintId)?.textContent).toBe(
      "Used to sign in.",
    );
    expect(document.getElementById(errorId)?.textContent).toBe(
      "Enter an email.",
    );
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("is not invalid and has no description when there is no hint or error", () => {
    render(<Field label="Email" />);
    const input = screen.getByLabelText("Email");

    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });

  it("gives two fields different ids", () => {
    render(
      <>
        <Field label="First" />
        <Field label="Second" />
      </>,
    );

    expect(screen.getByLabelText("First").id).not.toBe(
      screen.getByLabelText("Second").id,
    );
  });
});

describe("Skeleton (AC-6)", () => {
  it("is static and hidden from screen readers", () => {
    render(<Skeleton data-testid="skeleton" />);
    const skeleton = screen.getByTestId("skeleton");

    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton.className).not.toContain("animate");
  });
});

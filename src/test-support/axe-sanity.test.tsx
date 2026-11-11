// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { axeViolations } from "./axe";

afterEach(cleanup);

it("reports an icon button with no name, so a clean scan means something", async () => {
  const { container } = render(<button type="button" />);

  expect((await axeViolations(container)).join()).toContain("button-name");
});

it("reports a form field with no label", async () => {
  const { container } = render(<input type="text" />);

  expect((await axeViolations(container)).join()).toContain("label");
});

it("is clean for a labelled button", async () => {
  const { container } = render(<button type="button">Save</button>);

  expect(await axeViolations(container)).toEqual([]);
});

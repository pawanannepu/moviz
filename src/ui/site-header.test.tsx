// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";

vi.mock("next/navigation", () => ({ usePathname: () => "/feed" }));

afterEach(cleanup);

const LINKS = [
  { href: "/feed", label: "Feed" },
  { href: "/swipe", label: "Swipe" },
];

describe("SiteHeader (AC-7)", () => {
  it("links the wordmark home", () => {
    render(<SiteHeader links={LINKS} />);

    expect(
      screen.getByRole("link", { name: "Moviz" }).getAttribute("href"),
    ).toBe("/");
  });

  it("marks only the current page with aria-current", () => {
    render(<SiteHeader links={LINKS} />);

    expect(
      screen.getByRole("link", { name: "Feed" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Swipe" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("lists the links in a named navigation", () => {
    render(<SiteHeader links={LINKS} />);

    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spec 0010, AC-13 to AC-15: the feed store keeps the loaded picks in browser
// memory only, hands them back to the same user for the same first batch, and
// remembers which movie was opened only while the feed is one step behind.
const { nav } = vi.hoisted(() => ({ nav: { pathname: "/home" } }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import {
  type FeedStore,
  FeedStoreProvider,
  type KeptFeed,
  useFeedStore,
} from "./feed-store";
import type { FeedPick } from "./types";

const pick = (id: number): FeedPick => ({
  movie: {
    id,
    title: `Movie ${id}`,
    releaseYear: 2000,
    posterPath: null,
    genres: [],
  },
  reason: `Because you loved Anchor ${id} (1990)`,
  moreLikeThis: false,
});

const kept = (overrides: Partial<KeptFeed> = {}): KeptFeed => ({
  userId: "user-1",
  seedIds: [1, 2, 3],
  picks: [1, 2, 3, 4, 5].map(pick),
  done: false,
  hiddenIds: [],
  ...overrides,
});

/** Hands the store of the nearest provider to the test. */
function Probe({ onStore }: { onStore: (store: FeedStore) => void }) {
  onStore(useFeedStore());
  return null;
}

function mount() {
  const seen: FeedStore[] = [];
  const tree = () => (
    <FeedStoreProvider>
      <Probe onStore={(store) => seen.push(store)} />
    </FeedStoreProvider>
  );
  const view = render(tree());
  return {
    store: seen[0],
    seen,
    /** Renders again at a new path, as a page change does. */
    goTo(pathname: string) {
      nav.pathname = pathname;
      view.rerender(tree());
    },
  };
}

beforeEach(() => {
  nav.pathname = "/home";
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

describe("FeedStore kept list (AC-13, AC-14)", () => {
  it("has nothing to give before a list is saved", () => {
    const { store } = mount();

    expect(store.read("user-1", [1, 2, 3])).toBeNull();
  });

  it("gives the saved list back to the same user for the same first batch", () => {
    const { store } = mount();
    const saved = kept({ done: true });

    store.save(saved);

    expect(store.read("user-1", [1, 2, 3])).toEqual(saved);
  });

  it("is ignored for another user", () => {
    const { store } = mount();
    store.save(kept());

    expect(store.read("user-2", [1, 2, 3])).toBeNull();
  });

  it.each([
    ["other ids", [7, 8, 9]],
    ["the same ids in another order", [2, 1, 3]],
    ["one id changed", [1, 2, 4]],
    ["a shorter first batch", [1, 2]],
    ["a longer first batch", [1, 2, 3, 4]],
    ["an empty first batch", []],
  ])("is ignored when the first batch has %s", (_name, seedIds) => {
    const { store } = mount();
    store.save(kept());

    expect(store.read("user-1", seedIds)).toBeNull();
  });

  it("changes nothing when read, so it is safe to call while rendering", () => {
    const { store } = mount();
    store.save(kept());

    store.read("user-2", [1, 2, 3]);
    store.read("user-1", [9, 9, 9]);
    const first = store.read("user-1", [1, 2, 3]);
    const second = store.read("user-1", [1, 2, 3]);

    expect(first).toEqual(kept());
    expect(second).toBe(first);
  });

  it("keeps only the newest saved list", () => {
    const { store } = mount();
    store.save(kept());

    store.save(kept({ seedIds: [7, 8, 9], picks: [7, 8, 9].map(pick) }));

    expect(store.read("user-1", [1, 2, 3])).toBeNull();
    expect(store.read("user-1", [7, 8, 9])?.picks).toHaveLength(3);
  });

  it("keeps the list across page changes and renders", () => {
    const { store, seen, goTo } = mount();
    store.save(kept());

    goTo("/movie/4");
    goTo("/import");
    goTo("/home");

    expect(new Set(seen).size).toBe(1);
    expect(store.read("user-1", [1, 2, 3])).toEqual(kept());
  });

  it("is empty again after a reload, which mounts a new provider", () => {
    const first = mount();
    first.store.save(kept());
    cleanup();

    const second = mount();

    expect(second.store).not.toBe(first.store);
    expect(second.store.read("user-1", [1, 2, 3])).toBeNull();
    expect(second.store.opened).toBeNull();
  });

  it("works the same in Strict Mode", () => {
    const seen: FeedStore[] = [];
    render(
      <StrictMode>
        <FeedStoreProvider>
          <Probe onStore={(store) => seen.push(store)} />
        </FeedStoreProvider>
      </StrictMode>,
    );
    const store = seen[seen.length - 1];

    store.save(kept());
    store.markOpened(4);

    expect(store.read("user-1", [1, 2, 3])).toEqual(kept());
    expect(store.opened).toBe(4);
  });
});

describe("FeedStore never leaves memory (AC-14)", () => {
  it("writes nothing to localStorage, sessionStorage, cookies or the address", () => {
    const address = window.location.href;
    const cookies = document.cookie;
    const { store, goTo } = mount();

    store.save(kept());
    store.markOpened(4);
    goTo("/movie/4");
    store.read("user-1", [1, 2, 3]);
    store.clearOpened();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe(cookies);
    expect(window.location.href).toBe(address);
  });
});

describe("FeedStore opened movie (AC-14, AC-15)", () => {
  it("starts with no opened movie", () => {
    expect(mount().store.opened).toBeNull();
  });

  it("remembers the movie that was opened, and forgets it when told", () => {
    const { store } = mount();

    store.markOpened(42);
    expect(store.opened).toBe(42);

    store.clearOpened();
    expect(store.opened).toBeNull();
  });

  it("remembers only the last movie opened", () => {
    const { store } = mount();

    store.markOpened(42);
    store.markOpened(7);

    expect(store.opened).toBe(7);
  });

  it("keeps the opened movie on /home and on that movie's page", () => {
    const { store, goTo } = mount();
    store.markOpened(42);

    goTo("/movie/42");
    expect(store.opened).toBe(42);

    goTo("/home");
    expect(store.opened).toBe(42);
  });

  it.each([
    ["the import page", "/import"],
    ["another movie's page", "/movie/7"],
    ["a page whose address only starts like the movie's", "/movie/421"],
    ["the landing page", "/"],
    ["onboarding", "/onboarding"],
  ])("forgets the opened movie on %s", (_name, pathname) => {
    const { store, goTo } = mount();
    store.markOpened(42);
    goTo("/movie/42");

    goTo(pathname);

    expect(store.opened).toBeNull();
  });

  it("does not bring the opened movie back when the user returns to its page", () => {
    const { store, goTo } = mount();
    store.markOpened(42);
    goTo("/movie/42");
    goTo("/import");

    goTo("/movie/42");

    expect(store.opened).toBeNull();
  });

  it("keeps the kept list when it forgets the opened movie", () => {
    const { store, goTo } = mount();
    store.save(kept());
    store.markOpened(4);

    goTo("/import");

    expect(store.opened).toBeNull();
    expect(store.read("user-1", [1, 2, 3])).toEqual(kept());
  });
});

describe("useFeedStore with no provider", () => {
  it("gives a store that keeps nothing, so a page outside the signed in area still renders", () => {
    let store!: FeedStore;
    render(
      <Probe
        onStore={(value) => {
          store = value;
        }}
      />,
    );

    store.save(kept());
    store.markOpened(42);

    expect(store.read("user-1", [1, 2, 3])).toBeNull();
    expect(store.opened).toBeNull();
    expect(() => store.clearOpened()).not.toThrow();
  });
});

"use client";

import { type Ref, useEffect, useImperativeHandle, useRef } from "react";

/** What a form can ask of the widget. */
export type TurnstileHandle = {
  /** The current token, or null while the check is still running or has failed. */
  token(): string | null;
  /** Clears the token and asks Cloudflare for a new one. Call after every response. */
  reset(): void;
};

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "dark";
      appearance: "interaction-only";
      callback(token: string): void;
      "error-callback"(): void;
      "expired-callback"(): void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once per page and resolves with its API. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile missing"));
    };
    script.onerror = () => reject(new Error("turnstile blocked"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    // Let a later mount try again, for example after an ad blocker is paused.
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

/**
 * The Cloudflare Turnstile bot check (spec 0005, AC-10, AC-11). A token works
 * once, so the form calls `reset()` after every response, good or bad, and the
 * widget also resets itself when its token expires. The widget stays out of the
 * way and shows a challenge only when Cloudflare needs one, so it is reachable
 * with the keyboard when it appears. The site key comes from the server page as
 * a prop, so no public environment variable is needed.
 */
export function Turnstile({
  siteKey,
  ref,
}: {
  siteKey: string;
  ref?: Ref<TurnstileHandle>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const token = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    token: () => token.current,
    reset: () => {
      token.current = null;
      if (widgetId.current !== null) window.turnstile?.reset(widgetId.current);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        widgetId.current = api.render(container, {
          sitekey: siteKey,
          theme: "dark",
          appearance: "interaction-only",
          callback: (value) => {
            token.current = value;
          },
          "error-callback": () => {
            token.current = null;
          },
          "expired-callback": () => {
            token.current = null;
            if (widgetId.current !== null) api.reset(widgetId.current);
          },
        });
      })
      .catch(() => {
        // Blocked or offline: no token, so the form shows its own message.
        token.current = null;
      });

    return () => {
      cancelled = true;
      if (widgetId.current !== null) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = null;
      }
      token.current = null;
    };
  }, [siteKey]);

  return <div ref={containerRef} />;
}

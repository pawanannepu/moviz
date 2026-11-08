"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

type RevealState = "hidden" | "shown" | undefined;

/**
 * Motion moment 2 (spec 0004): when a feed item scrolls into view after the
 * page has loaded, its subtitle bar wipes in once, left to right. Items already
 * in view when the page loads do not animate, so nothing flashes. The content
 * is visible with no JavaScript: only this effect hides the bar, and only for
 * items below the fold. With reduced motion it does nothing at all. The wipe
 * itself is CSS in `globals.css`, driven by `data-reveal`.
 */
export function ReasonReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RevealState>(undefined);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    setState("hidden");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} data-reveal={state}>
      {children}
    </div>
  );
}

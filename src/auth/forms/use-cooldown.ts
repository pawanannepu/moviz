"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A countdown for buttons that must wait between uses (the resend button waits
 * 60 seconds). `start(seconds)` begins a countdown; `remaining` ticks down to 0
 * once a second. The server enforces the same rule (spec 0005, AC-11), so this
 * only tells the person how long to wait.
 */
export function useCooldown(): {
  remaining: number;
  start: (seconds: number) => void;
} {
  const [remaining, setRemaining] = useState(0);
  const endsAt = useRef(0);

  const start = useCallback((seconds: number) => {
    endsAt.current = Date.now() + seconds * 1000;
    setRemaining(seconds);
  }, []);

  const active = remaining > 0;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      setRemaining(left);
    }, 1000);
    return () => clearInterval(timer);
  }, [active]);

  return { remaining, start };
}

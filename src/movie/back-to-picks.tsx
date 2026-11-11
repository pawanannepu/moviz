"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HOME_PATH } from "@/auth/paths";
import { useFeedStore } from "@/feed/feed-store";
import { BACK_TO_PICKS } from "./constants";

/**
 * The way back to the feed (spec 0010, AC-15). Always a real link to `/home`,
 * so it works on a direct visit, after a reload and with JavaScript off.
 *
 * With `movieId`, and only when that movie is the one the user last opened
 * from the feed in this visit, it goes back one step in browser history
 * instead. The feed is then one step behind, and a history return reuses the
 * page the browser already has, so the kept list shows with no new load. The
 * not found and error pages pass no `movieId` and always navigate.
 *
 * `onNavigate` runs only for a navigation inside the app, so opening the link
 * in a new tab is never turned into a history step.
 */
export function BackToPicks({ movieId }: { movieId?: number }) {
  const store = useFeedStore();
  const router = useRouter();

  return (
    <Link
      href={HOME_PATH}
      prefetch={false}
      onNavigate={(event) => {
        if (movieId === undefined || store.opened !== movieId) return;
        event.preventDefault();
        router.back();
      }}
      className="state-change inline-flex min-h-11 items-center gap-2 self-start text-muted-foreground underline-offset-8 hover:text-foreground hover:underline"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {BACK_TO_PICKS}
    </Link>
  );
}

"use client";

import { useState } from "react";
import { useFeedStore } from "@/feed/feed-store";
import type { FeedbackKind } from "./feedback";
import { FeedbackControls } from "./feedback-controls";

/**
 * The feedback controls on the movie page (spec 0011, AC-11). They stay on the
 * page: "Not interested" turns them into the Hidden line with Undo, and focus
 * follows. Every saved change goes to the kept feed, so the feed shows it when
 * the user goes back (AC-15). The page's reason bar stays until a reload.
 */
export function MovieFeedback({
  movie,
  initial,
}: {
  movie: { id: number; title: string };
  initial: FeedbackKind | null;
}) {
  const [kind, setKind] = useState(initial);
  const [announcement, setAnnouncement] = useState("");
  const store = useFeedStore();

  return (
    <>
      <FeedbackControls
        movie={movie}
        kind={kind}
        onSaved={(next) => {
          setKind(next);
          store.recordFeedback(movie.id, next);
        }}
        onAnnounce={setAnnouncement}
      />
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

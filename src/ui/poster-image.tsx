"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/ui/cn";

type PosterImageProps = {
  /** The poster address, or null when the movie has none. */
  src: string | null;
  alt: string;
  width: number;
  height: number;
  /** Shown in the fallback frame. */
  title: string;
  /** Marks the image as the most important one on the page. */
  priority?: boolean;
  className?: string;
};

/**
 * A 2:3 poster. When the poster is missing or fails to load (even before the
 * page hydrated), it shows a Curtain frame with the title set in Archivo, so
 * the page never shows a broken image. Posters are hotlinked from TMDB and
 * served as is (`unoptimized`), per spec 0003.
 */
export function PosterImage({
  src,
  alt,
  width,
  height,
  title,
  priority = false,
  className,
}: PosterImageProps) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  // A failure before hydration fires no React `onError`, so check on mount.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, []);

  if (src === null || failed) {
    return (
      <div
        data-slot="poster-fallback"
        aria-hidden="true"
        className={cn(
          "flex aspect-2/3 w-full items-start rounded-poster bg-card p-4",
          className,
        )}
      >
        <span className="type-section wrap-break-word">{title}</span>
      </div>
    );
  }

  return (
    <Image
      ref={imageRef}
      src={src}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      fetchPriority={priority ? "high" : undefined}
      onError={() => setFailed(true)}
      className={cn("aspect-2/3 w-full rounded-poster object-cover", className)}
    />
  );
}

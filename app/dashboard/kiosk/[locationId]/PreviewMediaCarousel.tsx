import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const IMAGE_DURATION_MS = 6000;
const FADE_MS = 700;

type Slide = { kind: "image"; uri: string } | { kind: "video"; uri: string };

/**
 * Web port of Dexa-POS's components/kiosk/template-b/KioskMediaCarousel.tsx
 * — same timing (6s per image, 700ms cross-fade, video plays to completion
 * then advances), same looping behavior over images then an optional
 * trailing video slide. Renders nothing when there's no media.
 */
export function PreviewMediaCarousel({
  imageUrls,
  videoUrl,
  className,
}: {
  imageUrls: string[];
  videoUrl: string | null;
  className?: string;
}) {
  const slides = useMemo<Slide[]>(() => {
    const imageSlides: Slide[] = imageUrls.map((uri) => ({ kind: "image", uri }));
    const videoSlide: Slide[] = videoUrl ? [{ kind: "video", uri: videoUrl }] : [];
    return [...imageSlides, ...videoSlide];
  }, [imageUrls, videoUrl]);

  const [index, setIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  const slide = slides[index] ?? null;

  const advance = () => {
    setIndex((i) => (slides.length <= 1 ? i : (i + 1) % slides.length));
  };

  useEffect(() => {
    if (!slide || slide.kind !== "image" || slides.length <= 1) return;
    const timer = setTimeout(advance, IMAGE_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide, slides.length]);

  useEffect(() => {
    if (slide?.kind !== "video") return;
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    video.play().catch(() => {});
  }, [slide]);

  if (!slide) return null;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {slides.map((s, i) => (
        <div
          key={`${s.kind}-${s.uri}-${i}`}
          className="absolute inset-0"
          style={{
            opacity: i === index ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease-out`,
          }}
        >
          {s.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.uri} alt="" className="h-full w-full object-cover" />
          ) : (
            <video
              ref={i === index ? videoRef : undefined}
              src={s.uri}
              muted
              playsInline
              className="h-full w-full object-cover"
              onEnded={i === index ? advance : undefined}
            />
          )}
        </div>
      ))}
    </div>
  );
}

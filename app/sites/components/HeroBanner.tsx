"use client";

import { useState, useRef } from "react";
import { Site } from "@/types/site";
import { cn } from "@/lib/utils";
import { Volume2, VolumeX } from "lucide-react";

interface HeroBannerProps {
  site: Site | null;
  className?: string;
}

export function HeroBanner({ site, className }: HeroBannerProps) {
  const heroImageUrl = site?.theme_config?.heroImageUrl;
  const heroVideoUrl = site?.theme_config?.heroVideoUrl;
  const templateId = site?.theme_config?.templateId || "classic";

  const heroHeight =
    templateId === "minimal"
      ? "h-40 sm:h-[200px]"
      : templateId === "bold"
      ? "h-52 sm:h-[360px] lg:h-[400px]"
      : "h-52 sm:h-[300px] lg:h-[360px]";

  return (
    <HeroShell
      heroImageUrl={heroImageUrl}
      heroVideoUrl={heroVideoUrl}
      heroHeight={heroHeight}
      className={className}
    />
  );
}

function HeroShell({
  heroImageUrl,
  heroVideoUrl,
  heroHeight,
  className,
}: {
  heroImageUrl?: string | null;
  heroVideoUrl?: string | null;
  heroHeight: string;
  className?: string;
}) {
  const hasMedia = heroImageUrl || heroVideoUrl;
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleMute = () => {
    setIsMuted((prev) => {
      if (videoRef.current) videoRef.current.muted = !prev;
      return !prev;
    });
  };

  const backgroundStyle = heroImageUrl && !heroVideoUrl
    ? {
        backgroundImage: `url(${heroImageUrl})`,
        backgroundSize: "cover" as const,
        backgroundPosition: "center",
      }
    : !heroVideoUrl
      ? { backgroundColor: "#F3F4F6" }
      : {};

  return (
    <div
      className={cn("relative w-full overflow-hidden", heroHeight, className)}
      style={backgroundStyle}
    >
      {heroVideoUrl && (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src={heroVideoUrl} type="video/mp4" />
          </video>
          <button
            type="button"
            onClick={toggleMute}
            className="absolute top-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors"
            style={{ backgroundColor: "rgba(0,0,0,0.45)", color: "#fff" }}
            aria-label={isMuted ? "Unmute video" : "Mute video"}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </>
      )}
      {/* Subtle bottom fade for natural transition into info strip */}
      {hasMedia && (
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/30 to-transparent pointer-events-none" />
      )}
    </div>
  );
}

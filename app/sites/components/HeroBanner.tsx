"use client";

import { useState, useRef, useCallback } from "react";
import { Site } from "@/types/site";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Volume2, VolumeX } from "lucide-react";

interface HeroBannerProps {
  site: Site | null;
  storeName: string;
  className?: string;
  locationHours?: string;
  locationAddress?: string;
  isStoreOpen?: boolean | null;
  prepTime?: number | null;
  pickupEnabled?: boolean;
  deliveryEnabled?: boolean;
}

export function HeroBanner({
  site,
  storeName,
  className,
  locationAddress,
  isStoreOpen,
  prepTime,
  pickupEnabled,
  deliveryEnabled,
}: HeroBannerProps) {
  const heroImageUrl = site?.theme_config?.heroImageUrl;
  const heroVideoUrl = site?.theme_config?.heroVideoUrl;
  const templateId = site?.theme_config?.templateId || "classic";
  const primaryColor = site?.theme_config?.primaryColor || "#2DD4BF";
  const secondaryColor = site?.theme_config?.secondaryColor || "#10b981";
  const description = site?.description;

  if (templateId === "bold") {
    return (
      <BoldHero
        heroImageUrl={heroImageUrl}
        heroVideoUrl={heroVideoUrl}
        storeName={storeName}
        className={className}
        isStoreOpen={isStoreOpen}
        prepTime={prepTime}
        pickupEnabled={pickupEnabled}
        deliveryEnabled={deliveryEnabled}
      />
    );
  }

  if (templateId === "minimal") {
    const minimalPickupEnabled = site?.online_ordering_config?.pickupEnabled !== false;
    const minimalDeliveryEnabled = site?.online_ordering_config?.deliveryEnabled === true;
    return (
      <MinimalHero
        storeName={storeName}
        description={description}
        isStoreOpen={isStoreOpen}
        pickupEnabled={minimalPickupEnabled}
        deliveryEnabled={minimalDeliveryEnabled}
        className={className}
      />
    );
  }

  return (
    <ClassicHero
      heroImageUrl={heroImageUrl}
      heroVideoUrl={heroVideoUrl}
      storeName={storeName}
      className={className}
      isStoreOpen={isStoreOpen}
      pickupEnabled={pickupEnabled}
      deliveryEnabled={deliveryEnabled}
    />
  );
}

function ClassicHero({
  heroImageUrl,
  heroVideoUrl,
  storeName,
  className,
  isStoreOpen,
  pickupEnabled,
  deliveryEnabled,
}: {
  heroImageUrl?: string | null;
  heroVideoUrl?: string | null;
  storeName?: string;
  className?: string;
  isStoreOpen?: boolean | null;
  pickupEnabled?: boolean;
  deliveryEnabled?: boolean;
}) {
  const hasMedia = heroImageUrl || heroVideoUrl;
  const backgroundStyle = heroImageUrl && !heroVideoUrl
    ? {
        backgroundImage: `url(${heroImageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : !heroVideoUrl
      ? { background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 50%, var(--primary) 100%)" }
      : {};

  const [isMuted, setIsMuted] = useState(true);
  const [ctaClicked, setCtaClicked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleMute = () => {
    setIsMuted((prev) => {
      if (videoRef.current) videoRef.current.muted = !prev;
      return !prev;
    });
  };

  const handleOrderNow = useCallback(() => {
    setCtaClicked(true);
    setTimeout(() => setCtaClicked(false), 900);
    document.getElementById("storefront-menu")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={cn(
        "relative w-full overflow-hidden",
        hasMedia ? "h-52 sm:h-[360px] lg:h-[420px]" : "h-52 sm:h-[280px]",
        className
      )}
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
      {(heroImageUrl || heroVideoUrl) && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      )}
      {!hasMedia && (
        <>
          {/* Subtle dot texture */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wOCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
          {/* Ambient glow top-right */}
          <div
            className="absolute top-0 right-0 w-[360px] h-[360px] pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(255,255,255,0.22) 0%, transparent 65%)",
              transform: "translate(30%, -30%)",
            }}
          />
          {/* Ambient glow bottom-left */}
          <div
            className="absolute bottom-0 left-0 w-[240px] h-[240px] pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)",
              transform: "translate(-30%, 30%)",
            }}
          />
        </>
      )}
      <div className="absolute inset-0 flex flex-col justify-end px-6 sm:px-10 pb-5 sm:pb-8 lg:pb-10">
        {storeName && (
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-3xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight text-white drop-shadow-lg"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {storeName}
          </motion.h1>
        )}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          {isStoreOpen !== null && isStoreOpen !== undefined && (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: isStoreOpen ? "rgba(16,185,129,0.85)" : "rgba(239,68,68,0.85)",
                color: "#ffffff",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: isStoreOpen ? "#6ee7b7" : "#fca5a5" }}
              />
              {isStoreOpen ? "Open Now" : "Closed"}
            </span>
          )}
          {pickupEnabled && (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "rgba(255,255,255,0.18)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.3)" }}
            >
              Pickup
            </span>
          )}
          {deliveryEnabled && (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "rgba(255,255,255,0.18)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.3)" }}
            >
              Delivery
            </span>
          )}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.45, ease: "easeOut" }}
          className="mt-4 flex items-center gap-3 flex-wrap"
        >
          <button
            type="button"
            className="inline-flex items-center px-6 py-2.5 text-sm font-bold rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              minHeight: "44px",
              backgroundColor: ctaClicked ? "color-mix(in srgb, var(--primary) 80%, #000)" : "var(--primary)",
              color: "var(--primary-text)",
              boxShadow: "0 4px 20px color-mix(in srgb, var(--primary) 55%, transparent)",
              transform: ctaClicked ? "scale(0.96)" : undefined,
            }}
            onClick={handleOrderNow}
          >
            {ctaClicked ? "↓ On my way!" : isStoreOpen === false ? "Schedule Order" : "Order Now"}
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function BoldHero({
  heroImageUrl,
  heroVideoUrl,
  storeName,
  className,
  isStoreOpen,
  prepTime,
  pickupEnabled,
  deliveryEnabled,
}: {
  heroImageUrl?: string | null;
  heroVideoUrl?: string | null;
  storeName?: string;
  className?: string;
  isStoreOpen?: boolean | null;
  prepTime?: number | null;
  pickupEnabled?: boolean;
  deliveryEnabled?: boolean;
}) {
  const hasMedia = heroImageUrl || heroVideoUrl;
  const backgroundStyle =
    heroImageUrl && !heroVideoUrl
      ? {
          backgroundImage: `url(${heroImageUrl})`,
          backgroundSize: "cover" as const,
          backgroundPosition: "center",
        }
      : !heroVideoUrl
      ? {
          background: `linear-gradient(135deg, color-mix(in srgb, var(--primary) 18%, var(--bg)) 0%, color-mix(in srgb, var(--secondary) 50%, var(--bg)) 40%, color-mix(in srgb, var(--primary) 38%, var(--bg)) 72%, var(--bg) 100%)`,
        }
      : {};

  const [isMuted, setIsMuted] = useState(true);
  const [ctaClicked, setCtaClicked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleMute = () => {
    setIsMuted((prev) => {
      if (videoRef.current) videoRef.current.muted = !prev;
      return !prev;
    });
  };

  const handleOrderNow = useCallback(() => {
    setCtaClicked(true);
    setTimeout(() => setCtaClicked(false), 900);
    document.getElementById("storefront-menu")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className={cn(
        "relative w-full overflow-hidden flex items-end",
        "h-56 sm:h-[55vh] sm:min-h-[420px] max-h-[680px]",
        className
      )}
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

      {/* Layered overlays for depth and text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent" />

      {/* Ambient glow when no media */}
      {!hasMedia && (
        <>
          {/* Primary glow — top-right corner */}
          <div
            className="absolute top-0 right-0 w-[55%] h-[120%] pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at 70% 30%, var(--primary) 0%, transparent 60%)",
              opacity: 0.45,
            }}
          />
          {/* Secondary glow — center */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at 58% 60%, var(--secondary) 0%, transparent 50%)",
              opacity: 0.35,
            }}
          />
          {/* Primary glow — bottom-left warmth */}
          <div
            className="absolute bottom-0 left-0 w-[40%] h-[60%] pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at 20% 80%, var(--primary) 0%, transparent 65%)",
              opacity: 0.22,
            }}
          />
        </>
      )}

      {/* Content — bottom-left editorial alignment */}
      <div className="relative z-10 w-full max-w-3xl px-6 sm:px-10 pb-5 sm:pb-12 lg:pb-16">
        {/* Accent bar */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-3 h-1 w-12 rounded-full origin-left"
          style={{ backgroundColor: "var(--primary)" }}
        />
        {storeName && (
          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-none tracking-tight"
            style={{
              color: "#FFFFFF",
              fontFamily: "var(--font-display)",
              textShadow: "0 2px 24px rgba(0,0,0,0.4)",
            }}
          >
            {storeName}
          </motion.h1>
        )}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.4 }}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          {isStoreOpen !== null && isStoreOpen !== undefined && (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: isStoreOpen ? "rgba(16,185,129,0.85)" : "rgba(239,68,68,0.85)",
                color: "#ffffff",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: isStoreOpen ? "#6ee7b7" : "#fca5a5" }}
              />
              {isStoreOpen ? "Open Now" : "Closed"}
            </span>
          )}
          {pickupEnabled && (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.25)" }}
            >
              Pickup
            </span>
          )}
          {deliveryEnabled && (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.25)" }}
            >
              Delivery
            </span>
          )}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
          className="mt-5 flex items-center gap-4 flex-wrap"
        >
          <button
            type="button"
            className="inline-flex items-center gap-2 px-7 py-3 text-sm font-bold rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              minHeight: "44px",
              backgroundColor: ctaClicked ? "color-mix(in srgb, var(--primary) 80%, #000)" : "var(--primary)",
              color: "var(--primary-text)",
              boxShadow: "0 4px 28px color-mix(in srgb, var(--primary) 65%, transparent)",
              transform: ctaClicked ? "scale(0.96)" : undefined,
            }}
            onClick={handleOrderNow}
          >
            {ctaClicked ? "↓ On my way!" : isStoreOpen === false ? "Schedule Order" : "Order Now"}
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function MinimalHero({
  storeName,
  description,
  isStoreOpen,
  pickupEnabled,
  deliveryEnabled,
  className,
}: {
  storeName?: string;
  description?: string | null;
  isStoreOpen?: boolean | null;
  pickupEnabled?: boolean;
  deliveryEnabled?: boolean;
  className?: string;
}) {
  const [ctaClicked, setCtaClicked] = useState(false);
  const handleOrderNow = useCallback(() => {
    setCtaClicked(true);
    setTimeout(() => setCtaClicked(false), 900);
    document.getElementById("storefront-menu")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const desc = description?.trim();
  if (!storeName && !desc) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn("w-full px-4 sm:px-6 pt-6 pb-2 max-w-3xl mx-auto", className)}
    >
      {storeName && (
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
          className="text-4xl font-extrabold tracking-tight mb-1"
          style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}
        >
          {storeName}
        </motion.h1>
      )}
      {desc && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4, ease: "easeOut" }}
          className="text-sm leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          {desc}
        </motion.p>
      )}
      {(isStoreOpen !== null && isStoreOpen !== undefined) || pickupEnabled || deliveryEnabled ? (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.35, ease: "easeOut" }}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          {isStoreOpen !== null && isStoreOpen !== undefined && (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: isStoreOpen ? "color-mix(in srgb, #10b981 15%, var(--bg))" : "color-mix(in srgb, #ef4444 15%, var(--bg))",
                color: isStoreOpen ? "#059669" : "#dc2626",
                border: `1px solid ${isStoreOpen ? "color-mix(in srgb, #10b981 30%, transparent)" : "color-mix(in srgb, #ef4444 30%, transparent)"}`,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: isStoreOpen ? "#10b981" : "#ef4444" }}
              />
              {isStoreOpen ? "Open Now" : "Closed"}
            </span>
          )}
          {pickupEnabled && (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--bg))",
                color: "var(--primary)",
                border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)",
              }}
            >
              Pickup
            </span>
          )}
          {deliveryEnabled && (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--bg))",
                color: "var(--primary)",
                border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)",
              }}
            >
              Delivery
            </span>
          )}
        </motion.div>
      ) : null}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.35, ease: "easeOut" }}
        className="mt-4"
      >
        <button
          type="button"
          className="inline-flex items-center px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            backgroundColor: ctaClicked ? "color-mix(in srgb, var(--primary) 80%, #000)" : "var(--primary)",
            color: "var(--primary-text)",
            boxShadow: "0 3px 12px color-mix(in srgb, var(--primary) 35%, transparent)",
            transform: ctaClicked ? "scale(0.96)" : undefined,
          }}
          onClick={handleOrderNow}
        >
          {ctaClicked ? "↓ On my way!" : isStoreOpen === false ? "Schedule Order" : "Order Now"}
        </button>
      </motion.div>
    </motion.div>
  );
}

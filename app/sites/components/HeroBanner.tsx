"use client";

import { Site } from "@/types/site";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Clock, MapPin, Star } from "lucide-react";

interface HeroBannerProps {
  site: Site | null;
  storeName: string;
  className?: string;
  locationHours?: string;
  locationAddress?: string;
}

export function HeroBanner({
  site,
  storeName,
  className,
  locationAddress,
}: HeroBannerProps) {
  const heroImageUrl = site?.theme_config?.heroImageUrl;
  const templateId = site?.theme_config?.templateId || "classic";
  const primaryColor = site?.theme_config?.primaryColor || "#2DD4BF";
  const secondaryColor = site?.theme_config?.secondaryColor || "#10b981";
  const description = site?.description;

  if (templateId === "bold") {
    return (
      <BoldHero
        heroImageUrl={heroImageUrl}
        storeName={storeName}
        description={description}
        locationAddress={locationAddress}
        className={className}
      />
    );
  }

  if (templateId === "minimal") {
    return (
      <MinimalHero
        storeName={storeName}
        description={description}
        locationAddress={locationAddress}
        className={className}
      />
    );
  }

  // Classic
  const backgroundStyle = heroImageUrl
    ? {
        backgroundImage: `url(${heroImageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 50%, ${primaryColor} 100%)`,
      };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={cn(
        "relative w-full overflow-hidden",
        heroImageUrl
          ? "h-[280px] sm:h-[320px] lg:h-[380px]"
          : "h-[200px] sm:h-[240px]",
        className
      )}
      style={backgroundStyle}
    >
      {heroImageUrl && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/50" />
      )}
      {!heroImageUrl && (
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wOCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-60" />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
          className="text-3xl sm:text-4xl lg:text-5xl font-normal text-white drop-shadow-sm"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {storeName}
        </motion.h1>
        {description && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }}
            className="mt-3 text-white/85 text-sm sm:text-base max-w-md"
          >
            {description}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}

function BoldHero({
  heroImageUrl,
  storeName,
  description,
  locationAddress,
  className,
}: {
  heroImageUrl?: string | null;
  storeName: string;
  description?: string | null;
  locationAddress?: string;
  className?: string;
}) {
  const backgroundStyle = heroImageUrl
    ? {
        backgroundImage: `url(${heroImageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className={cn(
        "relative w-full overflow-hidden",
        heroImageUrl ? "h-[320px] sm:h-[380px]" : "py-20 sm:py-28",
        className
      )}
      style={{
        ...backgroundStyle,
        background: heroImageUrl
          ? undefined
          : "linear-gradient(180deg, #0A0A0A 0%, #1C1917 50%, #0A0A0A 100%)",
      }}
    >
      {heroImageUrl && (
        <div className="absolute inset-0 bg-black/50" />
      )}
      {/* Warm glow effects */}
      {!heroImageUrl && (
        <>
          <div
            className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-15"
            style={{
              background:
                "radial-gradient(circle, var(--primary) 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute -bottom-12 -left-12 w-72 h-72 rounded-full opacity-10"
            style={{
              background:
                "radial-gradient(circle, var(--primary) 0%, transparent 70%)",
            }}
          />
        </>
      )}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }}
          className="text-4xl sm:text-5xl lg:text-6xl text-white/95"
          style={{
            fontFamily: "var(--font-display)",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          {storeName}
        </motion.h1>
        {description && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
            className="mt-4 text-neutral-400 text-base sm:text-lg max-w-lg"
          >
            {description}
          </motion.p>
        )}
        {locationAddress && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.4 }}
            className="mt-5 flex items-center gap-2 text-neutral-500 text-sm"
          >
            <MapPin size={14} />
            <span>{locationAddress}</span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function MinimalHero({
  storeName,
  description,
  locationAddress,
  className,
}: {
  storeName: string;
  description?: string | null;
  locationAddress?: string;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn("w-full px-6 pt-24 pb-10 max-w-3xl mx-auto", className)}
    >
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5, ease: "easeOut" }}
        className="text-3xl sm:text-4xl font-bold"
        style={{
          fontFamily: "var(--font)",
          color: "var(--text)",
          letterSpacing: "-0.02em",
        }}
      >
        {storeName}
      </motion.h1>
      {description && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4, ease: "easeOut" }}
          className="mt-3 text-base"
          style={{ color: "var(--text-secondary)" }}
        >
          {description}
        </motion.p>
      )}
      {locationAddress && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="mt-4 flex items-center gap-2 text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          <MapPin size={14} />
          <span>{locationAddress}</span>
        </motion.div>
      )}
    </motion.div>
  );
}

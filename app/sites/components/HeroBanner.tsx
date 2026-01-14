"use client";

import { Site } from "@/types/site";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface HeroBannerProps {
  site: Site | null;
  storeName: string;
  className?: string;
}

export function HeroBanner({ site, storeName, className }: HeroBannerProps) {
  const heroImageUrl = site?.theme_config?.heroImageUrl;
  const bannerText = site?.banner_text;
  const primaryColor = site?.theme_config?.primaryColor || "#3b82f6";
  const secondaryColor = site?.theme_config?.secondaryColor || "#10b981";

  // Generate gradient fallback if no hero image
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
      transition={{ duration: 0.6 }}
      className={cn(
        "relative w-full overflow-hidden",
        heroImageUrl
          ? "h-[280px] sm:h-[320px] lg:h-[380px]"
          : "h-[180px] sm:h-[220px]",
        className
      )}
      style={backgroundStyle}
    >
      {/* Subtle overlay for better contrast when there's an image */}
      {heroImageUrl && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30" />
      )}

      {/* Decorative pattern overlay for gradient fallback */}
      {!heroImageUrl && (
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wOCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-60" />
      )}

      {/* Promotional Banner Text - positioned at bottom */}
      {bannerText && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute bottom-6 left-0 right-0 flex justify-center px-4"
        >
          <div className="bg-white/95 backdrop-blur-sm rounded-full px-6 py-2 shadow-lg">
            <p className="text-sm sm:text-base font-medium text-gray-800">
              {bannerText}
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

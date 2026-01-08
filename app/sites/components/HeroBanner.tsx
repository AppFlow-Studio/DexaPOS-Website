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
  const logoUrl = site?.logo_url;

  // Generate gradient if no hero image
  const backgroundStyle = heroImageUrl
    ? {
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.5)), url(${heroImageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: `linear-gradient(135deg, ${primaryColor}dd 0%, ${secondaryColor}dd 50%, ${primaryColor}dd 100%)`,
      };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn("relative w-full overflow-hidden", className)}
      style={backgroundStyle}
    >
      {/* Decorative pattern overlay */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center py-8 sm:py-12 lg:py-16 px-4">
        {/* Banner promotional text */}
        {bannerText && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/90 text-sm sm:text-base font-medium mb-4 sm:mb-6 text-center"
          >
            {bannerText}
          </motion.p>
        )}

        {/* Store title card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
          className="bg-white rounded-2xl shadow-2xl px-6 py-4 sm:px-8 sm:py-5 flex items-center gap-4 max-w-md"
        >
          {logoUrl ? (
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden shadow-md shrink-0">
              <img
                src={logoUrl}
                alt={storeName}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div
              className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-xl"
              style={{ backgroundColor: primaryColor }}
            >
              {storeName.charAt(0).toUpperCase()}
            </div>
          )}
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
            {storeName}
          </h2>
        </motion.div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-50 to-transparent" />
    </motion.div>
  );
}

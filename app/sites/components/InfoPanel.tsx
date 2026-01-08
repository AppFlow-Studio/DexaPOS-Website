"use client";

import { Site } from "@/types/site";
import { motion } from "framer-motion";
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Store,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OpenClosedIndicator } from "./OpenClosedIndicator";

interface InfoPanelProps {
  site: Site | null;
  location: {
    id: string;
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    phone: string | null;
    email: string | null;
    business_hours: any;
  };
}

// Parse business hours from various formats
function parseBusinessHours(
  businessHours: any
): { day: string; hours: string }[] {
  if (!businessHours) return [];

  // If it's a string, try to parse as JSON
  let parsed = businessHours;
  if (typeof businessHours === "string") {
    try {
      parsed = JSON.parse(businessHours);
    } catch {
      return [];
    }
  }

  // If it's an array of objects like [{ day: 'Monday', open: '9:00', close: '17:00' }]
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => ({
        day: item.day || item.name || "",
        hours: item.closed
          ? "Closed"
          : item.hours ||
            (item.open && item.close
              ? `${item.open} - ${item.close}`
              : "Closed"),
      }))
      .filter((item) => item.day);
  }

  // If it's an object (Legacy or WeeklySchedule)
  if (typeof parsed === "object") {
    const dayOrder = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];

    return dayOrder
      .map((day) => {
        const value =
          parsed[day] || parsed[day.charAt(0).toUpperCase() + day.slice(1)]; // check lowercase and Titlecase

        if (!value) return null;

        // Check for WeeklySchedule format { enabled: boolean, from: string, to: string, ... }
        if (typeof value === "object" && "enabled" in value) {
          if (!value.enabled) return { day, hours: "Closed" };
          if (value.is24Hours) return { day, hours: "Open 24 Hours" };
          return { day, hours: `${value.from} - ${value.to}` };
        }

        // Legacy format
        return {
          day,
          hours: value?.closed
            ? "Closed"
            : typeof value === "string"
            ? value
            : value?.open && value?.close
            ? `${value.open} - ${value.close}`
            : "Closed",
        };
      })
      .filter((item): item is { day: string; hours: string } => item !== null);
  }

  return [];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function InfoPanel({ site, location }: InfoPanelProps) {
  const storeName = site?.title || location.name;
  const description = site?.description;

  // Prefer Online Ordering Hours, fallback to Location Hours
  const rawBusinessHours =
    site?.online_ordering_config?.operatingHours || location.business_hours;
  const businessHours = parseBusinessHours(rawBusinessHours);

  const fullAddress = `${location.address_line1}, ${location.city}, ${location.state} ${location.postal_code}`;
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(
    fullAddress
  )}`;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 pb-8 overflow-hidden"
    >
      {/* Hero Section - Responsive for very narrow screens */}
      <motion.div
        variants={itemVariants}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 sm:p-6 text-white shadow-xl"
      >
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

        <div className="relative flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
          {site?.logo_url ? (
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-white p-2 shadow-lg shrink-0">
              <img
                src={site.logo_url}
                alt={storeName}
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm shrink-0">
              <Store className="h-8 w-8 sm:h-10 sm:w-10 text-white/80" />
            </div>
          )}

          <div className="flex-1 min-w-0 text-center sm:text-left">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
              {storeName}
            </h1>
            {description && (
              <p className="mt-1 text-xs sm:text-sm text-white/70 line-clamp-2">
                {description}
              </p>
            )}
            {/* Open/Closed Status */}
            <div className="mt-3 flex justify-center sm:justify-start">
              <OpenClosedIndicator
                businessHours={rawBusinessHours}
                showSchedule={true}
              />
            </div>
          </div>
        </div>

        {/* Decorative gradient orbs */}
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--primary)]/20 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-[var(--secondary)]/20 blur-3xl" />
      </motion.div>

      {/* Contact Cards - Responsive for narrow screens */}
      <div className="grid gap-3 sm:gap-4 overflow-hidden">
        {/* Address Card */}
        <motion.a
          variants={itemVariants}
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-3 sm:gap-4 rounded-xl bg-white p-3 sm:p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-[var(--primary)]/20 transition-all duration-300"
        >
          <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25">
            <MapPin className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-medium text-gray-500">
              Address
            </p>
            <p className="text-sm sm:text-base text-gray-900 font-medium truncate">
              {location.address_line1}
            </p>
            <p className="text-xs sm:text-sm text-gray-600 truncate">
              {location.city}, {location.state} {location.postal_code}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-sm font-medium text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity">
            <span>Directions</span>
            <ExternalLink className="h-4 w-4" />
          </div>
        </motion.a>

        {/* Phone Card */}
        {location.phone && (
          <motion.a
            variants={itemVariants}
            href={`tel:${location.phone}`}
            className="group flex items-center gap-3 sm:gap-4 rounded-xl bg-white p-3 sm:p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-[var(--primary)]/20 transition-all duration-300"
          >
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25">
              <Phone className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-500">
                Phone
              </p>
              <p className="text-sm sm:text-base text-gray-900 font-medium truncate">
                {location.phone}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-[var(--primary)] transition-colors" />
          </motion.a>
        )}

        {/* Email Card */}
        {location.email && (
          <motion.a
            variants={itemVariants}
            href={`mailto:${location.email}`}
            className="group flex items-center gap-3 sm:gap-4 rounded-xl bg-white p-3 sm:p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-[var(--primary)]/20 transition-all duration-300 overflow-hidden"
          >
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-lg shadow-violet-500/25">
              <Mail className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="text-xs sm:text-sm font-medium text-gray-500">
                Email
              </p>
              <p className="text-sm sm:text-base text-gray-900 font-medium truncate break-all">
                {location.email}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-[var(--primary)] transition-colors" />
          </motion.a>
        )}
      </div>

      {/* Business Hours - Responsive for very narrow screens */}
      {businessHours.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="rounded-xl bg-white p-3 sm:p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900">
              Business Hours
            </h3>
          </div>

          <div className="space-y-1 sm:space-y-2">
            {businessHours.map((item, index) => {
              const isToday =
                new Date()
                  .toLocaleDateString("en-US", { weekday: "long" })
                  .toLowerCase() === item.day.toLowerCase();
              return (
                <div
                  key={index}
                  className={cn(
                    "flex items-center justify-between py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg transition-colors gap-2",
                    isToday
                      ? "bg-[var(--primary)]/10 border border-[var(--primary)]/20"
                      : "hover:bg-gray-50"
                  )}
                >
                  <span
                    className={cn(
                      "text-sm sm:text-base font-medium truncate",
                      isToday ? "text-[var(--primary)]" : "text-gray-700"
                    )}
                  >
                    {item.day}
                    {isToday && (
                      <span className="ml-1 sm:ml-2 text-[10px] sm:text-xs bg-[var(--primary)] text-white px-1.5 sm:px-2 py-0.5 rounded-full">
                        Today
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-xs sm:text-sm whitespace-nowrap shrink-0",
                      item.hours.toLowerCase() === "closed"
                        ? "text-red-500 font-medium"
                        : "text-gray-600"
                    )}
                  >
                    {item.hours}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* No Hours Available */}
      {businessHours.length === 0 && (
        <motion.div
          variants={itemVariants}
          className="rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 p-6 text-center"
        >
          <Clock className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Hours not available</p>
          <p className="text-sm text-gray-500 mt-1">
            Contact the store for operating hours
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

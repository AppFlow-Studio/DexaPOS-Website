"use client";

import { Site } from "@/types/site";
import { motion } from "framer-motion";
import {
  MapPin,
  Phone,
  Mail,
  Clock,
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
              ? formatTimeRange(item.open, item.close)
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
          if (!value.enabled)
            return { day: capitalizeDay(day), hours: "Closed" };
          if (value.is24Hours)
            return { day: capitalizeDay(day), hours: "Open 24 Hours" };
          return {
            day: capitalizeDay(day),
            hours: formatTimeRange(value.from, value.to),
          };
        }

        // Legacy format
        return {
          day: capitalizeDay(day),
          hours: value?.closed
            ? "Closed"
            : typeof value === "string"
            ? value
            : value?.open && value?.close
            ? formatTimeRange(value.open, value.close)
            : "Closed",
        };
      })
      .filter((item): item is { day: string; hours: string } => item !== null);
  }

  return [];
}

// Helper to capitalize day name
function capitalizeDay(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

// Helper to format time range in 12-hour format
function formatTimeRange(from: string, to: string): string {
  const formatTime = (time: string): string => {
    if (!time) return "";
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = (minutes || 0).toString().padStart(2, "0");
    return `${displayHours}:${displayMinutes} ${period}`;
  };
  return `${formatTime(from)} - ${formatTime(to)}`;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
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
      className="space-y-4 pb-8 overflow-hidden max-w-2xl mx-auto"
    >
      {/* Store Header Card */}
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
      >
        <div className="flex items-start gap-4">
          {site?.logo_url ? (
            <div className="h-16 w-16 rounded-xl overflow-hidden shadow-sm border border-gray-100 shrink-0">
              <img
                src={site.logo_url}
                alt={storeName}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-xl text-white font-bold text-xl shrink-0"
              style={{
                backgroundColor: site?.theme_config?.primaryColor || "#3b82f6",
              }}
            >
              {storeName.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">
              {storeName}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                {description}
              </p>
            )}
            {/* Open/Closed Status */}
            <div className="mt-3">
              <OpenClosedIndicator
                businessHours={rawBusinessHours}
                showSchedule={true}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Contact Information */}
      <div className="space-y-2">
        {/* Address */}
        <motion.a
          variants={itemVariants}
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:border-gray-300 hover:shadow-md transition-all duration-200"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Address
            </p>
            <p className="text-sm text-gray-900 font-medium truncate mt-0.5">
              {location.address_line1}
            </p>
            <p className="text-sm text-gray-600 truncate">
              {location.city}, {location.state} {location.postal_code}
            </p>
          </div>
          <div className="flex items-center gap-1 text-sm text-gray-400 group-hover:text-gray-600 transition-colors">
            <ExternalLink className="h-4 w-4" />
          </div>
        </motion.a>

        {/* Phone */}
        {location.phone && (
          <motion.a
            variants={itemVariants}
            href={`tel:${location.phone}`}
            className="group flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:border-gray-300 hover:shadow-md transition-all duration-200"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
              <Phone className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Phone
              </p>
              <p className="text-sm text-gray-900 font-medium truncate mt-0.5">
                {location.phone}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
          </motion.a>
        )}

        {/* Email */}
        {location.email && (
          <motion.a
            variants={itemVariants}
            href={`mailto:${location.email}`}
            className="group flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:border-gray-300 hover:shadow-md transition-all duration-200"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
              <Mail className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Email
              </p>
              <p className="text-sm text-gray-900 font-medium truncate mt-0.5">
                {location.email}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
          </motion.a>
        )}
      </div>

      {/* Business Hours */}
      {businessHours.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
              <Clock className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Store Hours</h3>
          </div>

          <div className="space-y-0">
            {businessHours.map((item, index) => {
              const isToday =
                new Date()
                  .toLocaleDateString("en-US", { weekday: "long" })
                  .toLowerCase() === item.day.toLowerCase();
              const isClosed = item.hours.toLowerCase() === "closed";

              return (
                <div
                  key={index}
                  className={cn(
                    "flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors",
                    isToday
                      ? "bg-gray-50 border border-gray-200"
                      : "hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isToday ? "text-gray-900" : "text-gray-700"
                      )}
                    >
                      {item.day}
                    </span>
                    {isToday && (
                      <span className="text-[10px] font-semibold bg-gray-900 text-white px-1.5 py-0.5 rounded">
                        TODAY
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-sm",
                      isClosed
                        ? "text-gray-400"
                        : isToday
                        ? "text-gray-900 font-medium"
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
          className="bg-white rounded-xl border border-gray-200 p-6 text-center shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-400 mx-auto mb-3">
            <Clock className="h-6 w-6" />
          </div>
          <p className="text-gray-900 font-medium">Hours not available</p>
          <p className="text-sm text-gray-500 mt-1">
            Contact the store for operating hours
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

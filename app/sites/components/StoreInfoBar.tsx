"use client";

import { Site } from "@/types/site";
import { MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface StoreInfoBarProps {
  site: Site | null;
  location: {
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
  };
  className?: string;
}

// Helper to get today's hours in a readable format
function getTodayHoursString(businessHours: any): string | null {
  if (!businessHours) return null;

  // Parse if string
  let parsed = businessHours;
  if (typeof businessHours === "string") {
    try {
      parsed = JSON.parse(businessHours);
    } catch {
      return null;
    }
  }

  // Get current day
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const currentDay = days[new Date().getDay()];
  const schedule = parsed[currentDay];

  if (!schedule) return null;

  // Check if closed
  const isEnabled = schedule.enabled ?? !schedule.closed;
  if (!isEnabled) return "Closed today";

  // 24 hours
  if (schedule.is24Hours) return "Open 24 hours";

  // Get times
  const openTime = schedule.from || schedule.open;
  const closeTime = schedule.to || schedule.close;

  if (!openTime || !closeTime) return null;

  // Format times
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = (minutes || 0).toString().padStart(2, "0");
    return `${displayHours}:${displayMinutes} ${period}`;
  };

  return `${formatTime(openTime)} - ${formatTime(closeTime)}`;
}

export function StoreInfoBar({ site, location, className }: StoreInfoBarProps) {
  const storeName = site?.title || location.name;
  const logoUrl = site?.logo_url;
  const primaryColor = site?.theme_config?.primaryColor || "#3b82f6";

  // Get business hours - prefer online ordering hours, fallback to location hours
  const rawBusinessHours =
    site?.online_ordering_config?.operatingHours ||
    (location as any).business_hours;

  const todayHours = useMemo(
    () => getTodayHoursString(rawBusinessHours),
    [rawBusinessHours]
  );

  return (
    <div className={cn("bg-white border-b border-gray-100", className)}>
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Store Info - Left Side */}
          <div className="flex items-center gap-4">
            {/* Logo */}
            {logoUrl ? (
              <div className="h-14 w-14 rounded-xl overflow-hidden shadow-sm border border-gray-100 shrink-0">
                <img
                  src={logoUrl}
                  alt={storeName}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div
                className="h-14 w-14 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-xl shadow-sm"
                style={{ backgroundColor: primaryColor }}
              >
                {storeName.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Name & Details */}
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                {storeName}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-600">
                {/* Address */}
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="truncate">
                    {location.address_line1}, {location.city}, {location.state}
                  </span>
                </div>
                {/* Hours */}
                {todayHours && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span>Online ordering: {todayHours}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Side - Ready Time / Delivery Toggle (optional - can be added later) */}
          {/* 
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-600">
              <p className="font-semibold text-gray-900">Ready by 10:50 AM</p>
              <p className="text-xs">schedule at checkout</p>
            </div>
            <div className="flex bg-gray-100 rounded-full p-0.5">
              <button className="px-4 py-1.5 text-sm rounded-full">Delivery</button>
              <button className="px-4 py-1.5 text-sm rounded-full bg-gray-900 text-white">Pickup</button>
            </div>
          </div>
          */}
        </div>
      </div>
    </div>
  );
}

"use client";

import { Site } from "@/types/site";
import { MapPin, Clock, Store, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo, useCallback } from "react";

interface StoreInfoBarProps {
  site: Site | null;
  location: {
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
  };
  isStoreOpen?: boolean | null;
  todayHours?: string | null;
  className?: string;
}

export function getTodayHoursString(businessHours: any): string | null {
  if (!businessHours) return null;

  let parsed = businessHours;
  if (typeof businessHours === "string") {
    try {
      parsed = JSON.parse(businessHours);
    } catch {
      return null;
    }
  }

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

  const isEnabled = schedule.enabled ?? !schedule.closed;
  if (!isEnabled) return "Closed today";
  if (schedule.is24Hours) return "Open 24 hours";

  const openTime = schedule.from || schedule.open;
  const closeTime = schedule.to || schedule.close;
  if (!openTime || !closeTime) return null;

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = (minutes || 0).toString().padStart(2, "0");
    return `${displayHours}:${displayMinutes} ${period}`;
  };

  return `${formatTime(openTime)} – ${formatTime(closeTime)}`;
}

/**
 * Returns a string like "Open until 11:00 PM" given the business hours object.
 * Used for plain-text status display (no badge).
 */
export function getOpenUntilString(businessHours: any): string | null {
  if (!businessHours) return null;

  let parsed = businessHours;
  if (typeof businessHours === "string") {
    try {
      parsed = JSON.parse(businessHours);
    } catch {
      return null;
    }
  }

  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const currentDay = days[new Date().getDay()];
  const schedule = parsed[currentDay];
  if (!schedule) return null;

  const isEnabled = schedule.enabled ?? !schedule.closed;
  if (!isEnabled) return null;
  if (schedule.is24Hours) return "Open 24 hours";

  const closeTime = schedule.to || schedule.close;
  if (!closeTime) return null;

  const [hours, minutes] = closeTime.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const displayMinutes = (minutes || 0).toString().padStart(2, "0");
  return `Open until ${displayHours}:${displayMinutes} ${period}`;
}

export function isStoreOpenNow(businessHours: any): boolean | null {
  if (!businessHours) return null;
  let parsed = businessHours;
  if (typeof businessHours === "string") {
    try {
      parsed = JSON.parse(businessHours);
    } catch {
      return null;
    }
  }
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const currentDay = days[new Date().getDay()];
  const schedule = parsed[currentDay];
  if (!schedule) return null;
  const isEnabled = schedule.enabled ?? !schedule.closed;
  if (!isEnabled) return false;
  if (schedule.is24Hours) return true;
  const openTime = schedule.from || schedule.open;
  const closeTime = schedule.to || schedule.close;
  if (!openTime || !closeTime) return null;
  const now = new Date();
  const [openH, openM] = openTime.split(":").map(Number);
  const [closeH, closeM] = closeTime.split(":").map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + (openM || 0);
  const closeMinutes = closeH * 60 + (closeM || 0);
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

export function StoreInfoBar({
  site,
  location,
  isStoreOpen,
  todayHours,
  className,
}: StoreInfoBarProps) {
  const storeName = site?.title || location.name;
  const logoUrl = site?.logo_url;
  const pickupEnabled = site?.online_ordering_config?.pickupEnabled !== false;
  const deliveryEnabled = site?.online_ordering_config?.deliveryEnabled === true;

  const rawBusinessHours =
    site?.online_ordering_config?.operatingHours ||
    (location as any).business_hours;

  const openUntilText = useMemo(
    () => getOpenUntilString(rawBusinessHours),
    [rawBusinessHours]
  );

  const handleOrderNow = useCallback(() => {
    document.getElementById("storefront-menu")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div
      className={cn("w-full", className)}
      style={{
        backgroundColor: "#FFFFFF",
        borderBottom: "1px solid #E5E7EB",
      }}
    >
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

          {/* Left: logo + name + address + hours */}
          <div className="flex items-start gap-3.5 min-w-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={storeName}
                className="h-12 w-12 rounded-lg object-cover shrink-0 border"
                style={{ borderColor: "#E5E7EB" }}
              />
            ) : (
              <div
                className="h-12 w-12 flex items-center justify-center shrink-0 rounded-lg font-bold text-lg border"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--primary) 10%, #FFFFFF)",
                  color: "var(--primary)",
                  borderColor: "#E5E7EB",
                }}
              >
                {storeName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <h1
                className="text-xl sm:text-2xl font-bold leading-tight truncate"
                style={{ color: "var(--primary)", fontFamily: "var(--font-display)" }}
              >
                {storeName}
              </h1>

              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm" style={{ color: "#6B7280" }}>
                <span className="inline-flex items-center gap-1.5 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary)" }} />
                  <span className="truncate">
                    {location.address_line1}, {location.city}
                  </span>
                </span>

                {/* Hours: plain text, no badge */}
                {isStoreOpen === false ? (
                  <span className="inline-flex items-center gap-1.5" style={{ color: "#DC2626" }}>
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    Closed
                  </span>
                ) : openUntilText ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary)" }} />
                    {openUntilText}
                  </span>
                ) : todayHours ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary)" }} />
                    {todayHours}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right: fulfillment toggle + Order Now */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Pickup / Delivery toggle — only shown when both are enabled */}
            {pickupEnabled && deliveryEnabled && (
              <div
                className="flex items-center rounded-lg overflow-hidden border text-sm font-medium"
                style={{ borderColor: "#E5E7EB" }}
              >
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-2"
                  style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                >
                  <Store className="h-3.5 w-3.5" />
                  Pickup
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-2"
                  style={{ backgroundColor: "#FFFFFF", color: "#6B7280" }}
                >
                  <Truck className="h-3.5 w-3.5" />
                  Delivery
                </span>
              </div>
            )}

            {/* Single label when only one is enabled */}
            {pickupEnabled && !deliveryEnabled && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border"
                style={{ borderColor: "#E5E7EB", color: "#6B7280", backgroundColor: "#FFFFFF" }}
              >
                <Store className="h-3.5 w-3.5" />
                Pickup only
              </span>
            )}
            {!pickupEnabled && deliveryEnabled && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border"
                style={{ borderColor: "#E5E7EB", color: "#6B7280", backgroundColor: "#FFFFFF" }}
              >
                <Truck className="h-3.5 w-3.5" />
                Delivery only
              </span>
            )}

            <button
              type="button"
              onClick={handleOrderNow}
              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors sm:px-5 sm:py-2.5 sm:text-sm"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-text)",
                minHeight: "36px",
              }}
            >
              Order Now
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

"use client";

import { Site } from "@/types/site";
import { MapPin, Clock, Store, Truck, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo, useCallback, useState } from "react";
import { StoreHoursModal } from "./StoreHoursModal";

interface StoreInfoBarProps {
  site: Site | null;
  location: {
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    timezone?: string | null;
  };
  isStoreOpen?: boolean | null;
  todayHours?: string | null;
  className?: string;
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

/**
 * Returns { dayIndex, hours, minutes } for "now" expressed in the given IANA
 * timezone (e.g. "America/New_York"). Falls back to browser-local time when
 * timezone is absent or unrecognised.
 */
function getNowInTz(timezone?: string | null): { dayIndex: number; hours: number; minutes: number } {
  const now = new Date();
  if (timezone) {
    try {
      // Use Intl to extract the wall-clock fields in the store's timezone.
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      });
      const parts = fmt.formatToParts(now);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
      const weekdayShort = get("weekday").toLowerCase(); // "sun", "mon", …
      const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      const dayIndex = dayMap[weekdayShort] ?? now.getDay();
      // hour12:false gives "0"–"23"; "24" can appear for midnight in some locales
      let hours = parseInt(get("hour"), 10);
      if (hours === 24) hours = 0;
      const minutes = parseInt(get("minute"), 10) || 0;
      return { dayIndex, hours, minutes };
    } catch {
      // Invalid timezone string — fall through to local
    }
  }
  return { dayIndex: now.getDay(), hours: now.getHours(), minutes: now.getMinutes() };
}

function parseHours(businessHours: any): Record<string, any> | null {
  if (!businessHours) return null;
  if (typeof businessHours === "string") {
    try {
      return JSON.parse(businessHours);
    } catch {
      return null;
    }
  }
  return businessHours;
}

function formatHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  const displayM = (m || 0).toString().padStart(2, "0");
  return `${displayH}:${displayM} ${period}`;
}

export function getTodayHoursString(businessHours: any, timezone?: string | null): string | null {
  const parsed = parseHours(businessHours);
  if (!parsed) return null;

  const { dayIndex } = getNowInTz(timezone);
  const schedule = parsed[DAYS[dayIndex]];
  if (!schedule) return null;

  const isEnabled = schedule.enabled ?? !schedule.closed;
  if (!isEnabled) return "Closed today";
  if (schedule.is24Hours) return "Open 24 hours";

  const openTime = schedule.from || schedule.open;
  const closeTime = schedule.to || schedule.close;
  if (!openTime || !closeTime) return null;

  return `${formatHour(openTime)} – ${formatHour(closeTime)}`;
}

/**
 * Returns a string like "Open until 11:00 PM" given the business hours object.
 * Used for plain-text status display (no badge).
 */
export function getOpenUntilString(businessHours: any, timezone?: string | null): string | null {
  const parsed = parseHours(businessHours);
  if (!parsed) return null;

  const { dayIndex } = getNowInTz(timezone);
  const schedule = parsed[DAYS[dayIndex]];
  if (!schedule) return null;

  const isEnabled = schedule.enabled ?? !schedule.closed;
  if (!isEnabled) return null;
  if (schedule.is24Hours) return "Open 24 hours";

  const closeTime = schedule.to || schedule.close;
  if (!closeTime) return null;

  return `Open until ${formatHour(closeTime)}`;
}

export function isStoreOpenNow(businessHours: any, timezone?: string | null): boolean | null {
  const parsed = parseHours(businessHours);
  if (!parsed) return null;

  const { dayIndex, hours, minutes } = getNowInTz(timezone);
  const schedule = parsed[DAYS[dayIndex]];
  if (!schedule) return null;

  const isEnabled = schedule.enabled ?? !schedule.closed;
  if (!isEnabled) return false;
  if (schedule.is24Hours) return true;

  const openTime = schedule.from || schedule.open;
  const closeTime = schedule.to || schedule.close;
  if (!openTime || !closeTime) return null;

  const [openH, openM] = openTime.split(":").map(Number);
  const [closeH, closeM] = closeTime.split(":").map(Number);
  const nowMinutes = hours * 60 + minutes;
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
  const [hoursModalOpen, setHoursModalOpen] = useState(false);

  const rawBusinessHours =
    site?.online_ordering_config?.operatingHours ||
    (location as any).business_hours;

  const locationTimezone = location.timezone ?? null;

  const openUntilText = useMemo(
    () => getOpenUntilString(rawBusinessHours, locationTimezone),
    [rawBusinessHours, locationTimezone]
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

                {/* Hours pill — clickable, opens weekly schedule modal */}
                {(isStoreOpen !== undefined && isStoreOpen !== null) || openUntilText || todayHours ? (
                  <button
                    type="button"
                    onClick={() => setHoursModalOpen(true)}
                    className="inline-flex items-center gap-1 transition-opacity hover:opacity-75"
                    style={isStoreOpen === false ? { color: "#DC2626" } : { color: "#374151" }}
                  >
                    <Clock
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: isStoreOpen === false ? "#DC2626" : "var(--primary)" }}
                    />
                    <span className="text-sm">
                      {isStoreOpen === false
                        ? "Closed"
                        : openUntilText || todayHours || "See hours"}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right: fulfillment badge + Order Now */}
          <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
            {/* Pickup / Delivery toggle — only shown when both are enabled */}
            {pickupEnabled && deliveryEnabled && (
              <div
                className="flex items-center flex-1 sm:flex-none text-sm font-medium"
                style={{ border: "1px solid #E5E7EB", borderRadius: "20px" }}
              >
                <span
                  className="inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none px-3 sm:px-4 py-2 whitespace-nowrap"
                  style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)", borderRadius: "20px 0 0 20px" }}
                >
                  <Store className="h-3.5 w-3.5 shrink-0" />
                  Pickup
                </span>
                <span
                  className="inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none px-3 sm:px-4 py-2 whitespace-nowrap"
                  style={{ backgroundColor: "#FFFFFF", color: "#6B7280", borderRadius: "0 20px 20px 0" }}
                >
                  <Truck className="h-3.5 w-3.5 shrink-0" />
                  Delivery
                </span>
              </div>
            )}

            {/* Single label when only one is enabled */}
            {pickupEnabled && !deliveryEnabled && (
              <span
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium"
                style={{ border: "1px solid #E5E7EB", borderRadius: "20px", color: "#374151", backgroundColor: "#FFFFFF" }}
              >
                <Store className="h-3.5 w-3.5" style={{ color: "#9ca3af" }} />
                Pickup only
              </span>
            )}
            {!pickupEnabled && deliveryEnabled && (
              <span
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium"
                style={{ border: "1px solid #E5E7EB", borderRadius: "20px", color: "#374151", backgroundColor: "#FFFFFF" }}
              >
                <Truck className="h-3.5 w-3.5" style={{ color: "#9ca3af" }} />
                Delivery only
              </span>
            )}

            <button
              type="button"
              onClick={handleOrderNow}
              className="inline-flex items-center justify-center flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-text)",
                borderRadius: "20px",
              }}
            >
              Order Now
            </button>
          </div>

        </div>
      </div>

      <StoreHoursModal
        open={hoursModalOpen}
        onOpenChange={setHoursModalOpen}
        businessHours={rawBusinessHours}
        timezone={locationTimezone}
        storeName={storeName}
        isStoreOpen={isStoreOpen}
      />
    </div>
  );
}

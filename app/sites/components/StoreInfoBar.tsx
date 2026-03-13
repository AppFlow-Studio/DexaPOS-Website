"use client";

import { Site } from "@/types/site";
import { MapPin, Clock, Store, Truck } from "lucide-react";
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

function getTodayHoursString(businessHours: any): string | null {
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

  return `${formatTime(openTime)} - ${formatTime(closeTime)}`;
}

export function StoreInfoBar({ site, location, className }: StoreInfoBarProps) {
  const storeName = site?.title || location.name;
  const logoUrl = site?.logo_url;
  const pickupEnabled = site?.online_ordering_config?.pickupEnabled !== false;
  const deliveryEnabled = site?.online_ordering_config?.deliveryEnabled === true;

  const rawBusinessHours =
    site?.online_ordering_config?.operatingHours ||
    (location as any).business_hours;

  const todayHours = useMemo(
    () => getTodayHoursString(rawBusinessHours),
    [rawBusinessHours]
  );

  return (
    <div
      className={cn("", className)}
      style={{
        backgroundColor: "var(--bg)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {logoUrl ? (
              <div
                className="h-13 w-13 overflow-hidden shrink-0 ring-2 shadow-md"
                style={{
                  borderRadius: "var(--radius)",
                  ringColor: "var(--border)",
                }}
              >
                <img
                  src={logoUrl}
                  alt={storeName}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div
                className="h-13 w-13 flex items-center justify-center shrink-0 font-bold text-xl shadow-md ring-2"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-text)",
                  borderRadius: "var(--radius)",
                  ringColor: "color-mix(in srgb, var(--primary) 30%, transparent)",
                }}
              >
                {storeName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <h1
                className="text-xl sm:text-2xl font-bold truncate leading-tight"
                style={{
                  color: "var(--text)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {storeName}
              </h1>
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary)" }} />
                  <span className="truncate">
                    {location.address_line1}, {location.city}, {location.state}
                  </span>
                </div>
                {todayHours && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary)" }} />
                    <span>{todayHours}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {(pickupEnabled || deliveryEnabled) && (
            <div className="flex items-center gap-2 shrink-0">
              {pickupEnabled && (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)",
                    color: "var(--primary)",
                  }}
                >
                  <Store className="h-3 w-3" />
                  Pickup
                </span>
              )}
              {deliveryEnabled && (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)",
                    color: "var(--primary)",
                  }}
                >
                  <Truck className="h-3 w-3" />
                  Delivery
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
